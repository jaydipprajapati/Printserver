const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const printerService = require('./printerService');

async function createDiagnosticPdf(printerName, outputPath) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Border
  page.drawRectangle({
    x: 20,
    y: 20,
    width: 555.28,
    height: 801.89,
    borderWidth: 2,
    borderColor: rgb(0.1, 0.1, 0.1),
    color: rgb(0.98, 0.98, 0.98)
  });

  // Header Banner
  page.drawRectangle({
    x: 22,
    y: 740,
    width: 551.28,
    height: 80,
    color: rgb(0.1, 0.2, 0.4)
  });

  page.drawText('QR PRINT SERVER - HARDWARE TEST PAGE', {
    x: 40,
    y: 780,
    size: 20,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  page.drawText('Physical USB / Wi-Fi Printer Communication Verified', {
    x: 40,
    y: 755,
    size: 11,
    font: fontRegular,
    color: rgb(0.8, 0.9, 1)
  });

  // Info Section
  const details = [
    ['Target Printer:', printerName],
    ['Timestamp:', new Date().toLocaleString()],
    ['Operating System:', `${process.platform} (${process.arch})`],
    ['Node.js Version:', process.version],
    ['Printing Engine:', 'SumatraPDF & Windows Print Spooler Integration']
  ];

  let startY = 690;
  details.forEach(([label, val]) => {
    page.drawText(label, { x: 50, y: startY, size: 12, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(val, { x: 200, y: startY, size: 12, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
    startY -= 24;
  });

  // Test alignment grid / box
  page.drawRectangle({
    x: 50,
    y: 200,
    width: 495.28,
    height: 320,
    borderWidth: 1,
    borderColor: rgb(0.7, 0.7, 0.7),
    color: rgb(1, 1, 1)
  });

  page.drawText('PRINTER ALIGNMENT & GRADIENT CHECK', {
    x: 70,
    y: 490,
    size: 14,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1)
  });

  // Draw simulated gradient / grayscale bars
  const shades = [0.1, 0.3, 0.5, 0.7, 0.9];
  let barX = 70;
  shades.forEach((shade, i) => {
    page.drawRectangle({
      x: barX,
      y: 410,
      width: 70,
      height: 50,
      color: rgb(shade, shade, shade)
    });
    page.drawText(`${(1 - shade) * 100}%`, {
      x: barX + 20,
      y: 390,
      size: 10,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2)
    });
    barX += 80;
  });

  page.drawText('Status: If you can read this clearly, your printer is 100% operational!', {
    x: 70,
    y: 340,
    size: 11,
    font: fontBold,
    color: rgb(0, 0.5, 0.2)
  });

  // Footer
  page.drawText('Automated by QR Code Online Printing Service | Node.js + Windows Agent', {
    x: 80,
    y: 40,
    size: 10,
    font: fontRegular,
    color: rgb(0.5, 0.5, 0.5)
  });

  const bytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, bytes);
  return outputPath;
}

async function run() {
  const printers = await printerService.getDetailedPrinters();
  console.log('Available Printers:');
  printers.forEach((p, idx) => {
    console.log(`[${idx + 1}] ${p.name} (Port: ${p.portName})`);
  });

  // Default to Canon MF3010 if found, else default or Microsoft Print to PDF
  let selected = printers.find(p => p.name.includes('Canon') || p.name.includes('MF3010'));
  if (!selected) {
    selected = printers.find(p => p.name.includes('PDF')) || printers[0];
  }

  const targetPrinter = process.argv[2] || (selected ? selected.name : 'Microsoft Print to PDF');
  console.log(`\n🎯 Testing silent print to: "${targetPrinter}"...`);

  const testPdfPath = path.join(__dirname, 'test_diagnostic.pdf');
  await createDiagnosticPdf(targetPrinter, testPdfPath);
  console.log(`Diagnostic PDF generated at: ${testPdfPath}`);

  try {
    await printerService.printDocument(testPdfPath, {
      printer: targetPrinter,
      copies: 1,
      colorMode: 'bw'
    });
    console.log(`\n✅ Print command successfully sent to "${targetPrinter}"!`);
  } catch (err) {
    console.error(`\n❌ Failed to print to "${targetPrinter}":`, err.message);
  }
}

if (require.main === module) {
  run();
}

module.exports = { createDiagnosticPdf, run };
