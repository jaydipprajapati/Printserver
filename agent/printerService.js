const ptp = require('pdf-to-printer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class PrinterService {
  /**
   * Get all installed Windows printers with detailed properties
   */
  async getDetailedPrinters() {
    try {
      const basicPrinters = await ptp.getPrinters();
      const statusMap = await this.queryWindowsPrinterStatus();

      return basicPrinters.map(p => {
        const extra = statusMap[p.name] || {};
        return {
          name: p.name,
          deviceId: p.deviceId,
          paperSizes: p.paperSizes || ['A4', 'Letter', 'Legal'],
          portName: extra.portName || 'Unknown',
          driverName: extra.driverName || 'Generic',
          printerStatus: extra.printerStatus || 'Normal',
          isDefault: extra.isDefault || false,
          isOnline: extra.printerStatus ? extra.printerStatus.toLowerCase() !== 'offline' : true
        };
      });
    } catch (err) {
      console.error('[PrinterService] Error querying printers:', err);
      return [];
    }
  }

  /**
   * Run PowerShell Get-Printer to fetch hardware-level details
   */
  queryWindowsPrinterStatus() {
    return new Promise((resolve) => {
      const psCommand = `Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus, Default | ConvertTo-Json`;
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, { timeout: 10000 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve({});
        }
        try {
          const parsed = JSON.parse(stdout);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          const map = {};
          list.forEach(item => {
            if (item && item.Name) {
              map[item.Name] = {
                driverName: item.DriverName,
                portName: item.PortName,
                printerStatus: item.PrinterStatus || 'Normal',
                isDefault: item.Default || false
              };
            }
          });
          resolve(map);
        } catch (e) {
          resolve({});
        }
      });
    });
  }

  /**
   * Silent hardware print execution using SumatraPDF / Windows Print Spooler
   */
  async printDocument(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist at path: ${filePath}`);
    }

    const printOpts = {
      printer: options.printer,
      copies: parseInt(options.copies, 10) || 1,
      scale: 'fit',
      silent: true
    };

    if (options.orientation && ['portrait', 'landscape'].includes(options.orientation)) {
      printOpts.orientation = options.orientation;
    }

    if (options.paperSize) {
      printOpts.paperSize = options.paperSize;
    }

    if (options.colorMode === 'bw') {
      printOpts.monochrome = true;
    }

    if (options.duplex === 'duplex' || options.duplex === 'duplexlong') {
      printOpts.side = 'duplexlong';
    } else if (options.duplex === 'duplexshort') {
      printOpts.side = 'duplexshort';
    } else {
      printOpts.side = 'simplex';
    }

    console.log(`[PrinterService] 🖨️ Sending to Windows Spooler -> Printer: "${printOpts.printer}" | Copies: ${printOpts.copies} | Color: ${options.colorMode}`);

    try {
      await ptp.print(filePath, printOpts);
      console.log(`[PrinterService] ✅ Print command spooled successfully for ${options.printer}`);
      return { success: true };
    } catch (err) {
      console.error(`[PrinterService] ❌ Print failed with primary driver:`, err.message);

      // Resilient Fallback: PowerShell Start-Process PrintTo
      console.log(`[PrinterService] 🔄 Attempting fallback Windows shell PrintTo command...`);
      return this.printWithPowerShell(filePath, options.printer);
    }
  }

  /**
   * Resilient fallback print method using Windows native PrintTo verb
   */
  printWithPowerShell(filePath, printerName) {
    return new Promise((resolve, reject) => {
      const escapedFile = filePath.replace(/"/g, '""');
      const escapedPrinter = (printerName || '').replace(/"/g, '""');
      const cmd = `Start-Process -FilePath "${escapedFile}" -Verb PrintTo -ArgumentList '"${escapedPrinter}"' -PassThru | Out-Null`;

      exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd}"`, { timeout: 15000 }, (err) => {
        if (err) {
          return reject(new Error(`Fallback print also failed: ${err.message}`));
        }
        resolve({ success: true, fallback: true });
      });
    });
  }
}

module.exports = new PrinterService();
