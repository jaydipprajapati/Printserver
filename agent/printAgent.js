const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const printerService = require('./printerService');

// Agent configuration
const SERVER_URL = process.env.SERVER_URL || 'ws://127.0.0.1:4000/ws';
const AUTH_TOKEN = process.env.AGENT_AUTH_TOKEN || 'PRINT_AGENT_SECRET_SECURE_2026';
const AGENT_ID = process.env.AGENT_ID || `win-pc-${os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

const TEMP_DIR = path.join(__dirname, 'temp_print');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

let ws = null;
let heartbeatInterval = null;
let reconnectTimeout = null;

function connect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);

  const wsUrl = `${SERVER_URL}?type=agent&token=${encodeURIComponent(AUTH_TOKEN)}&agentId=${encodeURIComponent(AGENT_ID)}`;
  console.log(`\n[Print Agent] 🔌 Connecting to backend server: ${SERVER_URL}...`);

  ws = new WebSocket(wsUrl);

  ws.on('open', async () => {
    console.log(`[Print Agent] ✅ Connected to Print Server as: ${AGENT_ID}`);

    // Discover Windows printers
    console.log(`[Print Agent] 🔍 Discovering installed Windows printers...`);
    const printers = await printerService.getDetailedPrinters();
    console.log(`[Print Agent] Found ${printers.length} printer(s):`);
    printers.forEach(p => {
      console.log(`   - 🖨️  ${p.name} [Port: ${p.portName}] [Status: ${p.printerStatus}]`);
    });

    // Register with server
    ws.send(JSON.stringify({
      type: 'AGENT_REGISTER',
      agentId: AGENT_ID,
      hostname: os.hostname(),
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      printers
    }));

    // Start periodic heartbeat
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'HEARTBEAT' }));
      }
    }, 20000);
  });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'PRINT_JOB') {
        await handlePrintJob(msg);
      }
    } catch (err) {
      console.error('[Print Agent] Message handling error:', err);
    }
  });

  ws.on('close', (code, reason) => {
    console.warn(`[Print Agent] ⚠️ Disconnected from server (Code: ${code}, Reason: ${reason || 'Connection lost'}). Reconnecting in 3s...`);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    reconnectTimeout = setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    console.error(`[Print Agent] Connection error:`, err.message);
  });
}

/**
 * Handle incoming print command from server
 */
async function handlePrintJob(job) {
  console.log(`\n======================================================`);
  console.log(`[Print Agent] 📥 RECEIVED PRINT JOB: ${job.token} (Job ID: ${job.jobId})`);
  console.log(`Target Printer: ${job.printer}`);
  console.log(`Options: Copies=${job.options?.copies}, Color=${job.options?.colorMode}, Paper=${job.options?.paperSize}`);
  console.log(`======================================================`);

  // Report status: Spooling
  sendStatus(job.jobId, 'spooling', `Sending to Windows printer: ${job.printer}...`);

  let targetFilePath = null;

  try {
    // Check if local file path exists directly on this PC
    if (job.localFilePath && fs.existsSync(job.localFilePath)) {
      targetFilePath = job.localFilePath;
    } else {
      // Download from server URL
      targetFilePath = path.join(TEMP_DIR, `job_${job.jobId}.pdf`);
      console.log(`[Print Agent] Downloading document from ${job.fileUrl}...`);
      await downloadFile(job.fileUrl, targetFilePath);
    }

    // Execute physical hardware printing
    sendStatus(job.jobId, 'printing', `Printing on ${job.printer}...`);
    await printerService.printDocument(targetFilePath, {
      printer: job.printer,
      copies: job.options?.copies || 1,
      orientation: job.options?.orientation,
      paperSize: job.options?.paperSize,
      colorMode: job.options?.colorMode,
      duplex: job.options?.duplex
    });

    // Print successful!
    console.log(`[Print Agent] 🎉 Job ${job.token} printed successfully on ${job.printer}!`);
    sendStatus(job.jobId, 'completed', `Document printed successfully on ${job.printer}! Please collect from counter.`);

  } catch (err) {
    console.error(`[Print Agent] ❌ Error executing print job ${job.token}:`, err);
    sendStatus(job.jobId, 'failed', `Printing error: ${err.message}`);
  }
}

/**
 * Send status update back to the server
 */
function sendStatus(jobId, status, message = '', extra = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'JOB_STATUS',
      jobId,
      status,
      message,
      extra
    }));
  }
}

/**
 * Download file from HTTP/HTTPS URL
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;

    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        return reject(new Error(`Server returned status code: ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// Start agent
connect();
