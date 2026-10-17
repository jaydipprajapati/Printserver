const path = require('path');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');

// Helper to get local network IP address for QR codes and mobile access
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip internal (127.0.0.1) and non-ipv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIpAddress();
const port = parseInt(process.env.PORT, 10) || 4000;

module.exports = {
  PORT: port,
  HOST: '0.0.0.0',
  LOCAL_IP: localIp,
  BASE_URL: process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://${localIp}:${port}`,
  AGENT_AUTH_TOKEN: process.env.AGENT_AUTH_TOKEN || 'PRINT_AGENT_SECRET_SECURE_2026',

  // Directory paths
  ROOT_DIR,
  UPLOADS_DIR: path.join(ROOT_DIR, 'uploads'),
  CONVERTED_DIR: path.join(ROOT_DIR, 'converted'),
  DATA_DIR: path.join(ROOT_DIR, 'data'),
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),

  // Upload constraints
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
  SUPPORTED_EXTENSIONS: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.jpg', '.jpeg', '.png', '.webp', '.txt'],

  // Default Settings & Pricing (can be changed in Admin Dashboard)
  DEFAULT_SETTINGS: {
    shopName: 'FastPrint Express',
    counterName: 'Counter 01',
    tagline: 'Scan, Upload & Print in Seconds',
    currency: '₹',
    autoPrint: true, // Auto dispatch and print without manual approval
    defaultPrinter: 'Canon MF3010', // Default detected printer
    pricing: {
      bwPerPage: 2.0,       // ₹2.00 per page for B&W
      colorPerPage: 10.0,    // ₹10.00 per page for Color
      paperMultipliers: {
        A4: 1.0,
        A3: 2.0,
        Letter: 1.0,
        Legal: 1.25
      },
      duplexDiscountPercent: 10 // 10% off on second side
    },
    retentionMinutes: 120 // Clean files after 2 hours
  }
};
