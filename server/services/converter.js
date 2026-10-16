const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');
const { PDFDocument, rgb, StandardFonts, PageSizes } = require('pdf-lib');
const config = require('../config');

class ConverterService {
  /**
   * Parse page range string (e.g., "1-3, 5, 8-10", "all", "2")
   * Returns array of 1-based page numbers
   */
  parsePageRange(rangeStr, totalPages) {
    if (!rangeStr || rangeStr.toLowerCase() === 'all') {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages = new Set();
    const parts = rangeStr.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          const from = Math.max(1, Math.min(start, end));
          const to = Math.min(totalPages, Math.max(start, end));
          for (let p = from; p <= to; p++) {
            pages.add(p);
          }
        }
      } else {
        const p = parseInt(trimmed, 10);
        if (!isNaN(p) && p >= 1 && p <= totalPages) {
          pages.add(p);
        }
      }
    }

    const result = Array.from(pages).sort((a, b) => a - b);
    return result.length > 0 ? result : Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  /**
   * Get PDF page count and basic metadata
   */
  async getPdfInfo(filePath) {
    const fileBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(fileBytes, { ignoreEncryption: true });
    const pageCount = pdfDoc.getPageCount();
    const firstPage = pdfDoc.getPage(0);
    const { width, height } = firstPage.getSize();

    return {
      pageCount,
      width,
      height,
      isLandscape: width > height
    };
  }

  /**
   * Convert an Image (PNG, JPG, JPEG) to a high-res PDF page (A4)
   */
  async imageToPdf(imagePath, outputPath, options = {}) {
    const ext = path.extname(imagePath).toLowerCase();
    const imgBytes = fs.readFileSync(imagePath);

    const pdfDoc = await PDFDocument.create();
    let image;
    if (ext === '.png') {
      image = await pdfDoc.embedPng(imgBytes);
    } else {
      image = await pdfDoc.embedJpg(imgBytes);
    }

    const imgDims = image.scale(1.0);
    const isLandscape = options.orientation === 'landscape' || imgDims.width > imgDims.height;

    // Use A4 dimensions: 595.28 x 841.89 points
    const pageWidth = isLandscape ? PageSizes.A4[1] : PageSizes.A4[0];
    const pageHeight = isLandscape ? PageSizes.A4[0] : PageSizes.A4[1];

    const margin = 20; // 20pt margin
    const availWidth = pageWidth - margin * 2;
    const availHeight = pageHeight - margin * 2;

    const scale = Math.min(availWidth / imgDims.width, availHeight / imgDims.height);
    const renderWidth = imgDims.width * scale;
    const renderHeight = imgDims.height * scale;

    const x = margin + (availWidth - renderWidth) / 2;
    const y = margin + (availHeight - renderHeight) / 2;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(image, {
      x,
      y,
      width: renderWidth,
      height: renderHeight
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    return {
      outputPath,
      pageCount: 1
    };
  }

  /**
   * Convert plain text file to PDF with line-wrapping and pagination
   */
  async textToPdf(textPath, outputPath) {
    const textContent = fs.readFileSync(textPath, 'utf-8');
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 10;
    const lineHeight = 14;

    const pageWidth = PageSizes.A4[0];
    const pageHeight = PageSizes.A4[1];
    const margin = 40;
    const usableWidth = pageWidth - margin * 2;
    const usableHeight = pageHeight - margin * 2;
    const maxLinesPerPage = Math.floor(usableHeight / lineHeight);

    const rawLines = textContent.split(/\r?\n/);
    const wrappedLines = [];

    for (const rawLine of rawLines) {
      if (!rawLine) {
        wrappedLines.push('');
        continue;
      }
      let currentLine = '';
      const words = rawLine.split(' ');
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const width = font.widthOfTextAtSize(testLine, fontSize);
        if (width < usableWidth) {
          currentLine = testLine;
        } else {
          wrappedLines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) {
        wrappedLines.push(currentLine);
      }
    }

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let currentLineIndex = 0;

    for (let i = 0; i < wrappedLines.length; i++) {
      if (currentLineIndex >= maxLinesPerPage) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        currentLineIndex = 0;
      }
      const y = pageHeight - margin - (currentLineIndex * lineHeight);
      page.drawText(wrappedLines[i], {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1)
      });
      currentLineIndex++;
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    return {
      outputPath,
      pageCount: pdfDoc.getPageCount()
    };
  }

  /**
   * Convert Word DOCX or Excel XLSX to PDF using native Windows COM Automation
   */
  async officeDocToPdf(inputPath, outputPath) {
    const ext = path.extname(inputPath).toLowerCase();
    return new Promise((resolve, reject) => {
      let script = '';
      if (ext === '.docx' || ext === '.doc') {
        script = `
          $word = New-Object -ComObject Word.Application;
          $word.Visible = $false;
          try {
            $doc = $word.Documents.Open('${inputPath.replace(/\\/g, '\\\\')}');
            $doc.SaveAs([ref]'${outputPath.replace(/\\/g, '\\\\')}', [ref]17);
            $doc.Close();
            Write-Output "SUCCESS";
          } catch {
            Write-Error $_.Exception.Message;
          } finally {
            $word.Quit();
          }
        `;
      } else if (ext === '.xlsx' || ext === '.xls') {
        script = `
          $excel = New-Object -ComObject Excel.Application;
          $excel.Visible = $false;
          try {
            $wb = $excel.Workbooks.Open('${inputPath.replace(/\\/g, '\\\\')}');
            $wb.ExportAsFixedFormat(0, '${outputPath.replace(/\\/g, '\\\\')}');
            $wb.Close($false);
            Write-Output "SUCCESS";
          } catch {
            Write-Error $_.Exception.Message;
          } finally {
            $excel.Quit();
          }
        `;
      } else {
        return reject(new Error(`Unsupported office extension: ${ext}`));
      }

      exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/\r?\n/g, ' ')}"`, (err, stdout, stderr) => {
        if (err || stderr.includes('Error')) {
          console.warn(`Office COM conversion warning:`, stderr || err?.message);
          // If output file was created anyway, verify
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 100) {
            return resolve(outputPath);
          }
          return reject(new Error(stderr || err?.message || 'Office conversion failed'));
        }
        resolve(outputPath);
      });
    });
  }

  /**
   * Main Document Normalizer: Takes any uploaded file and creates a print-ready PDF
   */
  async normalizeToPdf(filePath, originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const baseId = path.basename(filePath, path.extname(filePath));
    const outputPath = path.join(config.CONVERTED_DIR, `${baseId}_print.pdf`);

    // Ensure converted dir exists
    if (!fs.existsSync(config.CONVERTED_DIR)) {
      fs.mkdirSync(config.CONVERTED_DIR, { recursive: true });
    }

    if (ext === '.pdf') {
      // Already PDF - copy to converted folder for safe manipulation
      fs.copyFileSync(filePath, outputPath);
      const info = await this.getPdfInfo(outputPath);
      return {
        pdfPath: outputPath,
        pageCount: info.pageCount,
        isConverted: false,
        dimensions: { width: info.width, height: info.height }
      };
    }

    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      const res = await this.imageToPdf(filePath, outputPath);
      return {
        pdfPath: outputPath,
        pageCount: res.pageCount,
        isConverted: true
      };
    }

    if (['.txt'].includes(ext)) {
      const res = await this.textToPdf(filePath, outputPath);
      return {
        pdfPath: outputPath,
        pageCount: res.pageCount,
        isConverted: true
      };
    }

    if (['.docx', '.doc', '.xlsx', '.xls'].includes(ext)) {
      try {
        await this.officeDocToPdf(filePath, outputPath);
        const info = await this.getPdfInfo(outputPath);
        return {
          pdfPath: outputPath,
          pageCount: info.pageCount,
          isConverted: true,
          dimensions: { width: info.width, height: info.height }
        };
      } catch (err) {
        console.error('Office conversion failed, returning fallback notification:', err);
        throw new Error(`Could not convert Office document to PDF: ${err.message}`);
      }
    }

    throw new Error(`Unsupported file type: ${ext}`);
  }

  /**
   * Slice specific page range into a dedicated print PDF
   */
  async slicePageRange(inputPdfPath, pageRangeStr) {
    const info = await this.getPdfInfo(inputPdfPath);
    const pagesToInclude = this.parsePageRange(pageRangeStr, info.pageCount);

    // If all pages, return original
    if (pagesToInclude.length === info.pageCount && pagesToInclude[0] === 1 && pagesToInclude[pagesToInclude.length - 1] === info.pageCount) {
      return {
        pdfPath: inputPdfPath,
        pagesCount: info.pageCount,
        pagesList: pagesToInclude
      };
    }

    const fileBytes = fs.readFileSync(inputPdfPath);
    const srcDoc = await PDFDocument.load(fileBytes);
    const newDoc = await PDFDocument.create();

    // 1-based to 0-based indices
    const pageIndices = pagesToInclude.map(p => p - 1);
    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);

    for (const page of copiedPages) {
      newDoc.addPage(page);
    }

    const slicedPath = inputPdfPath.replace('_print.pdf', `_sliced_${Date.now()}.pdf`);
    const newBytes = await newDoc.save();
    fs.writeFileSync(slicedPath, newBytes);

    return {
      pdfPath: slicedPath,
      pagesCount: pagesToInclude.length,
      pagesList: pagesToInclude
    };
  }

  /**
   * Generate an official A4 Printable Standee PDF with Blank QR Code & Advertisement
   */
  async generateStandeePdf(shopName, counterName, qrBuffer, outputPath) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Dark stylish outer border
    page.drawRectangle({
      x: 20,
      y: 20,
      width: 555.28,
      height: 801.89,
      borderWidth: 2.5,
      borderColor: rgb(0.08, 0.1, 0.16),
      color: rgb(1, 1, 1)
    });

    // Top Header Banner
    page.drawRectangle({
      x: 22,
      y: 720,
      width: 551.28,
      height: 100,
      color: rgb(0.06, 0.09, 0.16)
    });

    const titleText = (shopName || 'FASTPRINT EXPRESS').toUpperCase();
    page.drawText(titleText, {
      x: 40,
      y: 775,
      size: 26,
      font: fontBold,
      color: rgb(1, 1, 1)
    });

    page.drawText(`OFFICIAL SELF-SERVICE PRINT KIOSK • ${(counterName || 'COUNTER 01').toUpperCase()}`, {
      x: 40,
      y: 745,
      size: 12,
      font: fontBold,
      color: rgb(0.5, 0.65, 0.95)
    });

    // Main Advertisement Headline
    page.drawText('SCAN QR CODE TO PRINT FROM YOUR PHONE', {
      x: 60,
      y: 670,
      size: 18,
      font: fontBold,
      color: rgb(0.3, 0.32, 0.9)
    });

    page.drawText('No cables required • No app install • Direct Wi-Fi Printing', {
      x: 100,
      y: 648,
      size: 12,
      font: fontRegular,
      color: rgb(0.3, 0.35, 0.45)
    });

    // Embed QR Code
    if (qrBuffer) {
      const qrImage = await pdfDoc.embedPng(qrBuffer);
      const qrSize = 250;
      const qrX = (595.28 - qrSize) / 2;
      const qrY = 350;

      // QR box border
      page.drawRectangle({
        x: qrX - 10,
        y: qrY - 10,
        width: qrSize + 20,
        height: qrSize + 20,
        borderWidth: 2,
        borderColor: rgb(0.08, 0.1, 0.16),
        color: rgb(0.98, 0.98, 1)
      });

      page.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize
      });
    }

    // 3 Steps Guide Boxes
    const stepY = 220;
    const stepWidth = 160;
    const steps = [
      { num: '1', title: 'Scan QR Code', desc: 'Use phone camera' },
      { num: '2', title: 'Upload File', desc: 'PDF, Word, Photos' },
      { num: '3', title: 'Collect Prints', desc: 'Instant paper output' }
    ];

    steps.forEach((step, idx) => {
      const stepX = 45 + (idx * 175);
      page.drawRectangle({
        x: stepX,
        y: stepY,
        width: stepWidth,
        height: 75,
        borderWidth: 1,
        borderColor: rgb(0.8, 0.85, 0.9),
        color: rgb(0.96, 0.97, 1)
      });

      page.drawText(`[STEP ${step.num}]`, {
        x: stepX + 15,
        y: stepY + 52,
        size: 11,
        font: fontBold,
        color: rgb(0.3, 0.32, 0.9)
      });

      page.drawText(step.title, {
        x: stepX + 15,
        y: stepY + 34,
        size: 12,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.15)
      });

      page.drawText(step.desc, {
        x: stepX + 15,
        y: stepY + 18,
        size: 10,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5)
      });
    });

    // Supported formats banner
    page.drawRectangle({
      x: 45,
      y: 110,
      width: 505.28,
      height: 60,
      color: rgb(0.94, 0.96, 1)
    });

    page.drawText('SUPPORTED FORMATS: PDF  •  WORD (.DOCX)  •  EXCEL (.XLSX)  •  PHOTOS (JPG, PNG)', {
      x: 70,
      y: 135,
      size: 11,
      font: fontBold,
      color: rgb(0.2, 0.25, 0.4)
    });

    // Footer
    page.drawText('Automated Self-Service Kiosk • Powered by QR Online Printing Server', {
      x: 100,
      y: 45,
      size: 10,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5)
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    return outputPath;
  }
}

module.exports = new ConverterService();
