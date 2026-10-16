const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const storage = require('../storage');
const converter = require('../services/converter');
const pricing = require('../services/pricing');

// POST /api/jobs/calculate - Live price calculation
router.post('/jobs/calculate', (req, res) => {
  try {
    const { pagesCount = 1, copies = 1, colorMode = 'bw', paperSize = 'A4', duplex = 'simplex' } = req.body;
    const calculation = pricing.calculateCost({
      pagesCount: parseInt(pagesCount, 10) || 1,
      copies: parseInt(copies, 10) || 1,
      colorMode,
      paperSize,
      duplex
    });
    res.json({ success: true, calculation });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/jobs - Submit print order
router.post('/jobs', async (req, res) => {
  try {
    const {
      fileId,
      options = {},
      customerName = 'Customer',
      customerPhone = ''
    } = req.body;

    if (!fileId) {
      return res.status(400).json({ success: false, error: 'File ID is required' });
    }

    const convertedPdfPath = path.join(config.CONVERTED_DIR, `${fileId}_print.pdf`);
    if (!fs.existsSync(convertedPdfPath)) {
      return res.status(404).json({ success: false, error: 'File not found or expired. Please upload again.' });
    }

    const pdfInfo = await converter.getPdfInfo(convertedPdfPath);
    const totalPages = pdfInfo.pageCount;

    // Handle Page Range slicing
    const pageRange = options.pageRange || 'all';
    const sliceResult = await converter.slicePageRange(convertedPdfPath, pageRange);

    const printedPages = sliceResult.pagesCount;
    const copies = parseInt(options.copies, 10) || 1;
    const colorMode = options.colorMode || 'bw';
    const paperSize = options.paperSize || 'A4';
    const duplex = options.duplex || 'simplex';
    const orientation = options.orientation || (pdfInfo.isLandscape ? 'landscape' : 'portrait');

    const costData = pricing.calculateCost({
      pagesCount: printedPages,
      copies,
      colorMode,
      paperSize,
      duplex
    });

    const jobId = uuidv4();
    const settings = storage.getSettings();

    const job = storage.createJob({
      id: jobId,
      fileName: path.basename(sliceResult.pdfPath),
      originalName: req.body.originalName || `${fileId}.pdf`,
      fileSize: fs.statSync(sliceResult.pdfPath).size,
      fileType: '.pdf',
      filePath: sliceResult.pdfPath,
      previewUrl: `/api/preview/${fileId}`,
      options: {
        paperSize,
        colorMode,
        copies,
        orientation,
        pageRange,
        duplex
      },
      pageCount: totalPages,
      printedPages,
      totalCost: costData.totalCost,
      customerName,
      customerPhone,
      printerName: settings.defaultPrinter
    });

    console.log(`[Job Created] ID: ${job.id} | Token: ${job.pickupToken} | Pages: ${printedPages} | Cost: ₹${job.totalCost}`);

    // If autoPrint is enabled, trigger dispatch immediately
    if (settings.autoPrint) {
      setTimeout(() => {
        if (req.app.get('dispatchPrintJob')) {
          req.app.get('dispatchPrintJob')(job.id);
        }
      }, 500);
    }

    // Broadcast new job event
    const broadcast = req.app.get('broadcastWs');
    if (broadcast) {
      broadcast({
        type: 'JOB_CREATED',
        job
      });
    }

    res.json({
      success: true,
      job,
      costData
    });
  } catch (err) {
    console.error('[Create Job Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Error creating print order' });
  }
});

// GET /api/jobs/:id - Get specific job details
router.get('/jobs/:id', (req, res) => {
  const job = storage.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Print job not found' });
  }
  res.json({ success: true, job });
});

// GET /api/jobs/token/:token - Find job by pickup token (e.g. PR-1234)
router.get('/jobs/token/:token', (req, res) => {
  let token = req.params.token.trim();
  if (!token.startsWith('#')) token = `#${token}`;
  const job = storage.getJobByToken(token);
  if (!job) {
    return res.status(404).json({ success: false, error: 'No order found with this pickup token' });
  }
  res.json({ success: true, job });
});

// POST /api/jobs/:id/cancel - Cancel a job
router.post('/jobs/:id/cancel', (req, res) => {
  const job = storage.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  if (['printing', 'completed'].includes(job.status)) {
    return res.status(400).json({ success: false, error: `Cannot cancel a job that is already ${job.status}` });
  }

  const updated = storage.updateJobStatus(job.id, 'cancelled', 'Job cancelled by user');
  const broadcast = req.app.get('broadcastWs');
  if (broadcast) {
    broadcast({ type: 'JOB_STATUS_UPDATED', job: updated });
  }

  res.json({ success: true, job: updated });
});

// POST /api/jobs/print-standee - Direct 1-click print of blank QR Code & Advertisement Flyer
router.post('/jobs/print-standee', async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const settings = storage.getSettings();
    const copies = parseInt(req.body.copies, 10) || 1;
    const paperSize = req.body.paperSize || 'A4';

    const qrUrl = `${config.BASE_URL}?shop=${encodeURIComponent(settings.shopName)}&counter=${encodeURIComponent(settings.counterName)}`;
    const qrBuffer = await QRCode.toBuffer(qrUrl, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: 500,
      margin: 1
    });

    const jobId = uuidv4();
    const standeeFileName = `qr_standee_ad_${Date.now()}.pdf`;
    const outputPath = path.join(config.CONVERTED_DIR, standeeFileName);

    await converter.generateStandeePdf(settings.shopName, settings.counterName, qrBuffer, outputPath);

    const costData = pricing.calculateCost({
      pagesCount: 1,
      copies,
      colorMode: 'bw',
      paperSize,
      duplex: 'simplex'
    });

    const job = storage.createJob({
      id: jobId,
      fileName: standeeFileName,
      originalName: `Counter_QR_Advertisement.pdf`,
      fileSize: fs.statSync(outputPath).size,
      fileType: '.pdf',
      filePath: outputPath,
      previewUrl: `/api/download-job/${jobId}`,
      options: {
        paperSize,
        colorMode: 'bw',
        copies,
        orientation: 'portrait',
        pageRange: '1',
        duplex: 'simplex'
      },
      pageCount: 1,
      printedPages: 1,
      totalCost: costData.totalCost,
      customerName: req.body.customerName || 'Shop Counter Promo',
      customerPhone: '',
      printerName: settings.defaultPrinter
    });

    console.log(`[Standee Print Job Created] ID: ${job.id} | Token: ${job.pickupToken}`);

    if (settings.autoPrint) {
      setTimeout(() => {
        if (req.app.get('dispatchPrintJob')) {
          req.app.get('dispatchPrintJob')(job.id);
        }
      }, 300);
    }

    const broadcast = req.app.get('broadcastWs');
    if (broadcast) {
      broadcast({ type: 'JOB_CREATED', job });
    }

    res.json({
      success: true,
      job,
      message: 'QR Code & Advertisement sent to printer!'
    });
  } catch (err) {
    console.error('[Standee Print Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Error printing QR Standee' });
  }
});

module.exports = router;
