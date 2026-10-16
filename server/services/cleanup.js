const fs = require('fs');
const path = require('path');
const config = require('../config');
const storage = require('../storage');

class CleanupService {
  constructor() {
    this.intervalId = null;
  }

  start() {
    // Run cleanup every 30 minutes
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, 30 * 60 * 1000);

    // Initial check on startup
    this.runCleanup();
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  runCleanup() {
    try {
      const settings = storage.getSettings();
      const retentionMinutes = settings.retentionMinutes || 120;
      const cutoffTime = Date.now() - (retentionMinutes * 60 * 1000);

      [config.UPLOADS_DIR, config.CONVERTED_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          try {
            const stat = fs.statSync(filePath);
            if (stat.isFile() && stat.mtimeMs < cutoffTime) {
              fs.unlinkSync(filePath);
              console.log(`[Cleanup] Deleted expired file: ${file}`);
            }
          } catch (e) {
            // File might be in use or deleted
          }
        }
      });
    } catch (err) {
      console.error('[Cleanup Error]:', err.message);
    }
  }
}

module.exports = new CleanupService();
