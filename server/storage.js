const fs = require('fs');
const path = require('path');
const config = require('./config');

const SETTINGS_FILE = path.join(config.DATA_DIR, 'settings.json');
const JOBS_FILE = path.join(config.DATA_DIR, 'jobs.json');
const STATS_FILE = path.join(config.DATA_DIR, 'stats.json');

// Ensure data directory exists
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

function readJsonFile(filePath, defaultData) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultData;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
  }
}

class Storage {
  constructor() {
    this.settings = readJsonFile(SETTINGS_FILE, config.DEFAULT_SETTINGS);
    this.jobs = readJsonFile(JOBS_FILE, []);
    this.stats = readJsonFile(STATS_FILE, {
      totalJobs: 0,
      totalPrints: 0,
      totalPages: 0,
      totalRevenue: 0,
      bwPages: 0,
      colorPages: 0,
      dailyStats: {}
    });

    // In-memory active agents tracking
    this.agents = new Map();
  }

  // --- Settings ---
  getSettings() {
    return { ...this.settings };
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    writeJsonFile(SETTINGS_FILE, this.settings);
    return this.settings;
  }

  // --- Jobs ---
  getJobs() {
    return [...this.jobs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getJobById(id) {
    return this.jobs.find(j => j.id === id);
  }

  getJobByToken(pickupToken) {
    return this.jobs.find(j => j.pickupToken === pickupToken);
  }

  createJob(jobData) {
    const job = {
      id: jobData.id,
      pickupToken: jobData.pickupToken || this.generatePickupToken(),
      fileName: jobData.fileName,
      originalName: jobData.originalName,
      fileSize: jobData.fileSize,
      fileType: jobData.fileType,
      filePath: jobData.filePath,
      previewUrl: jobData.previewUrl,
      options: {
        paperSize: jobData.options?.paperSize || 'A4',
        colorMode: jobData.options?.colorMode || 'bw', // 'bw' or 'color'
        copies: parseInt(jobData.options?.copies, 10) || 1,
        orientation: jobData.options?.orientation || 'portrait',
        pageRange: jobData.options?.pageRange || 'all',
        duplex: jobData.options?.duplex || 'simplex'
      },
      pageCount: jobData.pageCount || 1,
      printedPages: jobData.printedPages || 1,
      totalCost: jobData.totalCost || 0,
      customerName: jobData.customerName || 'Guest Customer',
      customerPhone: jobData.customerPhone || '',
      status: 'queued', // queued, processing, spooling, printing, completed, failed, cancelled
      printerName: jobData.printerName || this.settings.defaultPrinter,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      logs: [`[${new Date().toLocaleTimeString()}] Order placed and queued`]
    };

    this.jobs.unshift(job);
    // Keep max 200 jobs in file
    if (this.jobs.length > 200) {
      this.jobs = this.jobs.slice(0, 200);
    }
    writeJsonFile(JOBS_FILE, this.jobs);
    return job;
  }

  updateJobStatus(id, status, logMessage = null, extraData = {}) {
    const job = this.jobs.find(j => j.id === id);
    if (!job) return null;

    job.status = status;
    job.updatedAt = new Date().toISOString();
    Object.assign(job, extraData);

    if (logMessage) {
      if (!job.logs) job.logs = [];
      job.logs.push(`[${new Date().toLocaleTimeString()}] ${logMessage}`);
    }

    if (status === 'completed' && !job.countedInStats) {
      this.recordJobCompleted(job);
      job.countedInStats = true;
    }

    writeJsonFile(JOBS_FILE, this.jobs);
    return job;
  }

  recordJobCompleted(job) {
    const today = new Date().toISOString().split('T')[0];
    this.stats.totalJobs += 1;
    this.stats.totalPrints += job.options.copies;
    const totalPrinted = (job.printedPages || 1) * (job.options.copies || 1);
    this.stats.totalPages += totalPrinted;
    this.stats.totalRevenue += (job.totalCost || 0);

    if (job.options.colorMode === 'color') {
      this.stats.colorPages += totalPrinted;
    } else {
      this.stats.bwPages += totalPrinted;
    }

    if (!this.stats.dailyStats[today]) {
      this.stats.dailyStats[today] = { jobs: 0, pages: 0, revenue: 0 };
    }
    this.stats.dailyStats[today].jobs += 1;
    this.stats.dailyStats[today].pages += totalPrinted;
    this.stats.dailyStats[today].revenue += (job.totalCost || 0);

    writeJsonFile(STATS_FILE, this.stats);
  }

  getStats() {
    return { ...this.stats };
  }

  generatePickupToken() {
    const prefix = 'PR';
    const num = Math.floor(1000 + Math.random() * 9000);
    return `#${prefix}-${num}`;
  }

  // --- Connected Agents Management ---
  registerAgent(agentId, agentInfo) {
    this.agents.set(agentId, {
      id: agentId,
      ...agentInfo,
      lastSeen: new Date().toISOString(),
      isOnline: true
    });
  }

  updateAgentHeartbeat(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastSeen = new Date().toISOString();
      agent.isOnline = true;
    }
  }

  removeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.isOnline = false;
    }
  }

  getAgents() {
    return Array.from(this.agents.values());
  }

  getAvailablePrinters() {
    const printersMap = new Map();
    for (const agent of this.agents.values()) {
      if (agent.isOnline && agent.printers) {
        for (const p of agent.printers) {
          printersMap.set(p.name, {
            ...p,
            agentId: agent.id,
            isOnline: true
          });
        }
      }
    }
    return Array.from(printersMap.values());
  }
}

module.exports = new Storage();
