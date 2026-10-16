const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const converter = require('../services/converter');
const pricing = require('../services/pricing');

// Ensure upload directory exists
if (!fs.existsSync(config.UPLOADS_DIR)) {
  fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });
}

// Multer storage engine
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueId = uuidv4();
    cb(null, `${uniqueId}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (config.SUPPORTED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Supported: PDF, Word (docx), Excel (xlsx), Images (JPG, PNG), Text`));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: config.MAX_FILE_SIZE_BYTES },
  fileFilter
});

// POST /api/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const originalName = req.file.originalname;
    const filePath = req.file.path;
    const fileId = path.basename(req.file.filename, path.extname(req.file.filename));

    console.log(`[Upload] Received file: ${originalName} (${(req.file.size / 1024).toFixed(1)} KB)`);

    // Normalize and convert to printable PDF
    const conversion = await converter.normalizeToPdf(filePath, originalName);

    // Initial pricing estimate
    const costEstimate = pricing.calculateCost({
      pagesCount: conversion.pageCount,
      copies: 1,
      colorMode: 'bw',
      paperSize: 'A4',
      duplex: 'simplex'
    });

    res.json({
      success: true,
      file: {
        id: fileId,
        originalName,
        fileName: path.basename(filePath),
        pdfFileName: path.basename(conversion.pdfPath),
        fileSize: req.file.size,
        fileType: path.extname(originalName).toLowerCase(),
        pageCount: conversion.pageCount,
        previewUrl: `/api/preview/${fileId}`,
        isConverted: conversion.isConverted,
        costEstimate
      }
    });
  } catch (err) {
    console.error('[Upload Error]:', err);
    res.status(500).json({ success: false, error: err.message || 'Error processing uploaded document' });
  }
});

// Preview endpoint - serves the normalized PDF for in-browser PDF.js rendering
router.get('/preview/:fileId', (req, res) => {
  const { fileId } = req.params;
  const pdfPath = path.join(config.CONVERTED_DIR, `${fileId}_print.pdf`);

  if (fs.existsSync(pdfPath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    return fs.createReadStream(pdfPath).pipe(res);
  }

  // Check in uploads dir if not found in converted
  const uploadFiles = fs.readdirSync(config.UPLOADS_DIR);
  const matched = uploadFiles.find(f => f.startsWith(fileId));
  if (matched) {
    const rawPath = path.join(config.UPLOADS_DIR, matched);
    return res.sendFile(rawPath);
  }

  res.status(404).json({ error: 'Preview file not found or expired' });
});

module.exports = router;
