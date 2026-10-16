const express = require('express');
const router = express.Router();
const config = require('../config');
const storage = require('../storage');
const qr = require('../services/qr');

// GET /api/admin/settings
router.get('/settings', (req, res) => {
  res.json({
    success: true,
    settings: storage.getSettings(),
    serverInfo: {
      baseUrl: config.BASE_URL,
      localIp: config.LOCAL_IP,
      port: config.PORT
    }
  });
});

// PUT /api/admin/settings
router.put('/settings', (req, res) => {
  try {
    const updated = storage.updateSettings(req.body);
    const broadcast = req.app.get('broadcastWs');
    if (broadcast) {
      broadcast({ type: 'SETTINGS_UPDATED', settings: updated });
    }
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/admin/printers
router.get('/printers', (req, res) => {
  const printers = storage.getAvailablePrinters();
  const agents = storage.getAgents();
  const settings = storage.getSettings();

  res.json({
    success: true,
    printers,
    agents,
    defaultPrinter: settings.defaultPrinter
  });
});

// GET /api/admin/jobs
router.get('/jobs', (req, res) => {
  const { status, limit = 50 } = req.query;
  let jobs = storage.getJobs();
  if (status) {
    jobs = jobs.filter(j => j.status === status);
  }
  res.json({
    success: true,
    total: jobs.length,
    jobs: jobs.slice(0, parseInt(limit, 10))
  });
});

// POST /api/admin/jobs/:id/print - Manual print or reprint
router.post('/jobs/:id/print', (req, res) => {
  const job = storage.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  const dispatch = req.app.get('dispatchPrintJob');
  if (!dispatch) {
    return res.status(500).json({ success: false, error: 'Dispatcher not initialized' });
  }

  const success = dispatch(job.id, req.body?.printerName);
  if (!success) {
    return res.status(503).json({
      success: false,
      error: 'No active Windows Print Agent connected to fulfill print request. Please start the Print Agent on your computer.'
    });
  }

  res.json({ success: true, message: 'Print command dispatched to Print Agent', job });
});

// POST /api/admin/jobs/:id/status - Update job status manually
router.post('/jobs/:id/status', (req, res) => {
  const { status, note } = req.body;
  const updated = storage.updateJobStatus(req.params.id, status, note || `Status updated manually to ${status}`);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  const broadcast = req.app.get('broadcastWs');
  if (broadcast) {
    broadcast({ type: 'JOB_STATUS_UPDATED', job: updated });
  }

  res.json({ success: true, job: updated });
});

const path = require('path');
const fs = require('fs');
const reportService = require('../services/reportService');

// GET /api/admin/reports - Analytics & Reports
router.get('/reports', (req, res) => {
  const stats = storage.getStats();
  const jobs = storage.getJobs();

  // Calculate today's stats
  const todayStr = new Date().toISOString().split('T')[0];
  const todayJobs = jobs.filter(j => j.createdAt.startsWith(todayStr));
  const todayRevenue = todayJobs.reduce((acc, j) => acc + (j.status === 'completed' ? (j.totalCost || 0) : 0), 0);
  const todayPages = todayJobs.reduce((acc, j) => acc + (j.status === 'completed' ? ((j.printedPages || 1) * (j.options.copies || 1)) : 0), 0);

  res.json({
    success: true,
    stats,
    today: {
      date: todayStr,
      jobsCount: todayJobs.length,
      pagesPrinted: todayPages,
      revenue: todayRevenue
    }
  });
});

// GET /api/admin/reports/monthly - Monthly & Device Aggregated Reports
router.get('/reports/monthly', (req, res) => {
  try {
    const { month, printer } = req.query;
    const allJobs = storage.getJobs();
    const reportData = reportService.generateMonthlyReportData(allJobs, month, printer);
    res.json({ success: true, ...reportData });
  } catch (err) {
    console.error('Error generating monthly report data:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/reports/export/pdf - Download PDF Report Document
router.get('/reports/export/pdf', async (req, res) => {
  try {
    const { month, printer } = req.query;
    const allJobs = storage.getJobs();
    const settings = storage.getSettings();
    const reportData = reportService.generateMonthlyReportData(allJobs, month, printer);
    const pdfBuffer = await reportService.generatePdfReport(reportData, settings);

    const safeFilename = `FastPrint_Report_${reportData.month || 'all'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Error generating PDF report:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/reports/export/csv - Download CSV Report Spreadsheet
router.get('/reports/export/csv', (req, res) => {
  try {
    const { month, printer } = req.query;
    const allJobs = storage.getJobs();
    const settings = storage.getSettings();
    const reportData = reportService.generateMonthlyReportData(allJobs, month, printer);
    const csvContent = reportService.generateCsvReport(reportData, settings);

    const safeFilename = `FastPrint_Report_${reportData.month || 'all'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Error generating CSV report:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/reports/print - Print Report directly to connected printer
router.post('/reports/print', async (req, res) => {
  try {
    const { month, printer } = req.body;
    const allJobs = storage.getJobs();
    const settings = storage.getSettings();
    const reportData = reportService.generateMonthlyReportData(allJobs, month, printer);
    const pdfBuffer = await reportService.generatePdfReport(reportData, settings);

    const tempFileName = `report_${Date.now()}.pdf`;
    const tempFilePath = path.join(config.CONVERTED_DIR, tempFileName);
    fs.writeFileSync(tempFilePath, pdfBuffer);

    const targetPrinter = printer && printer !== 'all' ? printer : settings.defaultPrinter;

    // Create a print job
    const job = storage.createJob({
      id: require('uuid').v4(),
      fileName: tempFileName,
      originalName: `Report_${reportData.monthLabel.replace(/\s+/g, '_')}.pdf`,
      fileSize: pdfBuffer.length,
      fileType: '.pdf',
      filePath: tempFilePath,
      previewUrl: '',
      options: {
        paperSize: 'A4',
        colorMode: 'bw',
        copies: 1,
        orientation: 'portrait',
        pageRange: 'all',
        duplex: 'simplex'
      },
      pageCount: 1,
      printedPages: 1,
      totalCost: 0,
      customerName: 'Admin System Report',
      printerName: targetPrinter
    });

    const dispatch = req.app.get('dispatchPrintJob');
    if (dispatch) {
      dispatch(job.id, targetPrinter);
    }

    res.json({
      success: true,
      message: `Report sent to printer "${targetPrinter}"`,
      job
    });
  } catch (err) {
    console.error('Error printing report:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/qr - Generate QR code for shop / counter
router.get('/qr', async (req, res) => {
  try {
    const { customUrl, width = 500 } = req.query;
    const qrData = await qr.generateDataUrl(customUrl, { width: parseInt(width, 10) });
    const svgData = await qr.generateSvg(customUrl);
    const settings = storage.getSettings();

    res.json({
      success: true,
      url: qrData.url,
      qrImage: qrData.dataUrl,
      svg: svgData.svg,
      shopInfo: {
        shopName: settings.shopName,
        counterName: settings.counterName,
        tagline: settings.tagline
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
