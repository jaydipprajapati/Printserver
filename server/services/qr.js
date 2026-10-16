const QRCode = require('qrcode');
const config = require('../config');
const storage = require('../storage');

class QrService {
  /**
   * Generate QR Code as DataURL (base64 image)
   */
  async generateDataUrl(customUrl = null, options = {}) {
    const settings = storage.getSettings();
    const url = customUrl || `${config.BASE_URL}?shop=${encodeURIComponent(settings.shopName)}&counter=${encodeURIComponent(settings.counterName)}`;

    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      margin: options.margin || 2,
      color: {
        dark: options.darkColor || '#0f172a',
        light: options.lightColor || '#ffffff'
      },
      width: options.width || 400
    });

    return {
      url,
      dataUrl: qrDataUrl
    };
  }

  /**
   * Generate QR Code as SVG vector
   */
  async generateSvg(customUrl = null) {
    const settings = storage.getSettings();
    const url = customUrl || `${config.BASE_URL}?shop=${encodeURIComponent(settings.shopName)}&counter=${encodeURIComponent(settings.counterName)}`;

    const svg = await QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    return {
      url,
      svg
    };
  }
}

module.exports = new QrService();
