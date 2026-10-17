const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./config');
const storage = require('./storage');
const cleanupService = require('./services/cleanup');

// Import routes
const uploadRoutes = require('./routes/upload');
const jobRoutes = require('./routes/jobs');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

// WebSocket Server
const wss = new WebSocket.Server({ server, path: '/ws' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(config.PUBLIC_DIR));

// Direct download route for Print Agent to fetch PDF
app.get('/api/download-job/:id', (req, res) => {
  const job = storage.getJobById(req.params.id);
  if (!job || !fs.existsSync(job.filePath)) {
    return res.status(404).send('Job file not found');
  }
  res.sendFile(job.filePath);
});

// Register API routes
app.use('/api', uploadRoutes);
app.use('/api', jobRoutes);
app.use('/api/admin', adminRoutes);

// Single page app routing for clean URLs
app.get('/admin', (req, res) => {
  res.sendFile(path.join(config.PUBLIC_DIR, 'admin.html'));
});

app.get('/standee', (req, res) => {
  res.sendFile(path.join(config.PUBLIC_DIR, 'standee.html'));
});

// Map of active connected Print Agent sockets
const activeAgentSockets = new Map();
// Set of active browser client sockets (customers and admin dashboard)
const clientSockets = new Set();

// Broadcast helper function
function broadcast(messageObj) {
  const payload = JSON.stringify(messageObj);
  for (const client of clientSockets) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

// Make broadcast accessible to routes
app.set('broadcastWs', broadcast);

// Job Dispatcher function
function dispatchPrintJob(jobId, overridePrinter = null) {
  const job = storage.getJobById(jobId);
  if (!job) {
    console.error(`[Dispatcher] Job ${jobId} not found`);
    return false;
  }

  // Find an available active agent
  let targetAgentSocket = null;
  let targetAgentId = null;

  for (const [agentId, socket] of activeAgentSockets.entries()) {
    if (socket.readyState === WebSocket.OPEN) {
      targetAgentSocket = socket;
      targetAgentId = agentId;
      break;
    }
  }

  if (!targetAgentSocket) {
    console.warn(`[Dispatcher] No active print agent connected to fulfill job ${job.pickupToken}`);
    storage.updateJobStatus(job.id, 'queued', 'Waiting for Windows Print Agent to connect');
    broadcast({ type: 'JOB_STATUS_UPDATED', job: storage.getJobById(job.id) });
    return false;
  }

  const settings = storage.getSettings();
  const printerName = overridePrinter || job.printerName || settings.defaultPrinter;

  console.log(`[Dispatcher] Sending job ${job.pickupToken} to agent ${targetAgentId} for printer: ${printerName}`);

  storage.updateJobStatus(job.id, 'processing', `Dispatched to Print Agent for ${printerName}`, {
    printerName,
    agentId: targetAgentId
  });

  const updatedJob = storage.getJobById(job.id);
  broadcast({ type: 'JOB_STATUS_UPDATED', job: updatedJob });

  // Send print command to Windows Print Agent
  targetAgentSocket.send(JSON.stringify({
    type: 'PRINT_JOB',
    jobId: job.id,
    token: job.pickupToken,
    fileUrl: `${config.BASE_URL}/api/download-job/${job.id}`,
    localFilePath: job.filePath,
    printer: printerName,
    options: {
      copies: job.options.copies,
      orientation: job.options.orientation,
      paperSize: job.options.paperSize,
      colorMode: job.options.colorMode,
      duplex: job.options.duplex
    }
  }));

  return true;
}

app.set('dispatchPrintJob', dispatchPrintJob);

// WebSocket Connection Management
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const isAgent = url.searchParams.get('type') === 'agent';
  const authToken = url.searchParams.get('token');

  if (isAgent) {
    // Validate agent authentication token
    if (authToken !== config.AGENT_AUTH_TOKEN) {
      console.warn('[WS] Agent rejected: Invalid auth token');
      ws.close(4001, 'Invalid authentication token');
      return;
    }

    const agentId = url.searchParams.get('agentId') || `agent-${Date.now()}`;
    activeAgentSockets.set(agentId, ws);
    console.log(`[WS] 🖨️ Windows Print Agent connected: ${agentId}`);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'AGENT_REGISTER') {
          console.log(`[WS] Agent registered with ${msg.printers?.length || 0} printers`);
          storage.registerAgent(agentId, {
            hostname: msg.hostname,
            os: msg.os,
            printers: msg.printers || []
          });

          // Check if default printer is still unset, auto set if Canon MF3010 is present
          const settings = storage.getSettings();
          const canonPrinter = (msg.printers || []).find(p => p.name.includes('Canon') || p.name.includes('MF3010'));
          if (canonPrinter && (!settings.defaultPrinter || settings.defaultPrinter === 'default')) {
            storage.updateSettings({ defaultPrinter: canonPrinter.name });
          }

          broadcast({ type: 'PRINTERS_UPDATED', printers: storage.getAvailablePrinters() });

          // Check if there are any queued jobs waiting to be printed
          const queuedJobs = storage.getJobs().filter(j => j.status === 'queued');
          if (queuedJobs.length > 0 && settings.autoPrint) {
            console.log(`[Dispatcher] Auto-dispatching ${queuedJobs.length} pending queued job(s)...`);
            queuedJobs.forEach(qj => dispatchPrintJob(qj.id));
          }
        }

        if (msg.type === 'HEARTBEAT') {
          storage.updateAgentHeartbeat(agentId);
        }

        if (msg.type === 'JOB_STATUS') {
          console.log(`[WS] Agent reported job ${msg.jobId} status: ${msg.status} (${msg.message || ''})`);
          const updated = storage.updateJobStatus(msg.jobId, msg.status, msg.message, msg.extra || {});
          if (updated) {
            broadcast({ type: 'JOB_STATUS_UPDATED', job: updated });
          }
        }
      } catch (err) {
        console.error('[WS Message Error]:', err);
      }
    });

    ws.on('close', () => {
      console.log(`[WS] ⚠️ Windows Print Agent disconnected: ${agentId}`);
      activeAgentSockets.delete(agentId);
      storage.removeAgent(agentId);
      broadcast({ type: 'PRINTERS_UPDATED', printers: storage.getAvailablePrinters() });
    });

  } else {
    // Regular Browser Client (Customer or Admin)
    clientSockets.add(ws);

    // Send initial status and settings
    ws.send(JSON.stringify({
      type: 'INIT',
      settings: storage.getSettings(),
      printers: storage.getAvailablePrinters()
    }));

    ws.on('close', () => {
      clientSockets.delete(ws);
    });
  }
});

// Start cleanup cron
cleanupService.start();

// Launch server
server.listen(config.PORT, config.HOST, () => {
  console.log('\n======================================================');
  console.log('🚀 QR CODE ONLINE PRINTING SERVER READY & RUNNING');
  console.log('======================================================');
  console.log(`📍 Local Address:       http://localhost:${config.PORT}`);
  console.log(`📱 Mobile Network QR:   http://${config.LOCAL_IP}:${config.PORT}`);
  console.log(`⚙️ Admin Dashboard:     http://localhost:${config.PORT}/admin`);
  console.log(`🖨️ Printable Standee:   http://localhost:${config.PORT}/standee`);
  console.log(`🔒 Agent Auth Token:    ${config.AGENT_AUTH_TOKEN}`);
  console.log('======================================================\n');
});

module.exports = { app, server };
