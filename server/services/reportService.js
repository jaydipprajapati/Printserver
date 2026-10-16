const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Categorize original filename or extension into standard document types
 */
function categorizeDocumentType(originalName = '', fileType = '') {
  const name = (originalName || '').toLowerCase().trim();
  const ext = (fileType || '').toLowerCase().trim();

  // Check original file extension first to distinguish Word, Excel, Photos, Text
  if (name.endsWith('.pdf')) return 'PDF';
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'Word (.docx)';
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return 'Excel (.xlsx)';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp') || name.endsWith('.bmp')) return 'Photos / Images';
  if (name.endsWith('.txt')) return 'Text (.txt)';

  // Fallback to fileType
  if (ext === '.pdf') return 'PDF';
  if (ext === '.docx' || ext === '.doc') return 'Word (.docx)';
  if (ext === '.xlsx' || ext === '.xls') return 'Excel (.xlsx)';
  if (['.jpg', '.jpeg', '.png', '.webp', '.bmp'].includes(ext)) return 'Photos / Images';
  if (ext === '.txt') return 'Text (.txt)';

  return 'Other';
}

/**
 * Generate comprehensive monthly and daily aggregated statistics
 */
function generateMonthlyReportData(allJobs = [], selectedMonth = null, selectedPrinter = null) {
  // Discover all months available in data
  const monthsSet = new Set();
  const printersSet = new Set();

  allJobs.forEach(job => {
    if (job.createdAt) {
      const monthStr = job.createdAt.substring(0, 7); // 'YYYY-MM'
      monthsSet.add(monthStr);
    }
    if (job.printerName) {
      printersSet.add(job.printerName);
    }
  });

  const currentMonthStr = new Date().toISOString().substring(0, 7);
  monthsSet.add(currentMonthStr);

  const availableMonths = Array.from(monthsSet).sort().reverse();
  const availablePrinters = Array.from(printersSet).sort();

  const activeMonth = selectedMonth && selectedMonth !== 'all' ? selectedMonth : currentMonthStr;

  // Filter jobs by month and optional printer
  let filteredJobs = allJobs.filter(job => {
    if (!job.createdAt) return false;
    const matchMonth = (selectedMonth === 'all') ? true : job.createdAt.startsWith(activeMonth);
    const matchPrinter = !selectedPrinter || selectedPrinter === 'all' || job.printerName === selectedPrinter;
    return matchMonth && matchPrinter;
  });

  // Calculate Aggregates
  let totalJobs = filteredJobs.length;
  let totalCompletedJobs = 0;
  let totalPrints = 0;
  let totalPages = 0;
  let totalRevenue = 0;
  let bwPages = 0;
  let colorPages = 0;

  const dailyMap = {};
  const formatMap = {
    'PDF': { count: 0, pages: 0, revenue: 0 },
    'Word (.docx)': { count: 0, pages: 0, revenue: 0 },
    'Excel (.xlsx)': { count: 0, pages: 0, revenue: 0 },
    'Photos / Images': { count: 0, pages: 0, revenue: 0 },
    'Text (.txt)': { count: 0, pages: 0, revenue: 0 },
    'Other': { count: 0, pages: 0, revenue: 0 }
  };
  const deviceMap = {};

  filteredJobs.forEach(job => {
    const isCompleted = job.status === 'completed';
    if (isCompleted) totalCompletedJobs++;

    const copies = parseInt(job.options?.copies, 10) || 1;
    const printedPages = parseInt(job.printedPages, 10) || 1;
    const jobPages = printedPages * copies;
    const cost = parseFloat(job.totalCost) || 0;
    const isColor = job.options?.colorMode === 'color';
    const printer = job.printerName || 'Default Printer';
    const docType = categorizeDocumentType(job.originalName, job.fileType);

    totalPrints += copies;
    totalPages += jobPages;
    totalRevenue += cost;

    if (isColor) {
      colorPages += jobPages;
    } else {
      bwPages += jobPages;
    }

    // Format metrics
    if (!formatMap[docType]) {
      formatMap[docType] = { count: 0, pages: 0, revenue: 0 };
    }
    formatMap[docType].count += 1;
    formatMap[docType].pages += jobPages;
    formatMap[docType].revenue += cost;

    // Device metrics
    if (!deviceMap[printer]) {
      deviceMap[printer] = { jobs: 0, pages: 0, revenue: 0 };
    }
    deviceMap[printer].jobs += 1;
    deviceMap[printer].pages += jobPages;
    deviceMap[printer].revenue += cost;

    // Daily breakdown
    const dateStr = job.createdAt.split('T')[0]; // YYYY-MM-DD
    if (!dailyMap[dateStr]) {
      const dateObj = new Date(dateStr + 'T12:00:00Z');
      dailyMap[dateStr] = {
        date: dateStr,
        dayName: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
        formattedDate: dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
        jobsCount: 0,
        completedJobs: 0,
        copiesCount: 0,
        pagesPrinted: 0,
        bwPages: 0,
        colorPages: 0,
        revenue: 0,
        formats: {
          'PDF': 0,
          'Word': 0,
          'Excel': 0,
          'Photos': 0,
          'Text': 0,
          'Other': 0
        },
        devices: {},
        jobList: []
      };
    }

    dailyMap[dateStr].jobsCount += 1;
    if (isCompleted) dailyMap[dateStr].completedJobs += 1;
    dailyMap[dateStr].copiesCount += copies;
    dailyMap[dateStr].pagesPrinted += jobPages;
    if (isColor) dailyMap[dateStr].colorPages += jobPages;
    else dailyMap[dateStr].bwPages += jobPages;
    dailyMap[dateStr].revenue += cost;

    // Daily format counter
    if (docType === 'PDF') dailyMap[dateStr].formats['PDF'] += 1;
    else if (docType.startsWith('Word')) dailyMap[dateStr].formats['Word'] += 1;
    else if (docType.startsWith('Excel')) dailyMap[dateStr].formats['Excel'] += 1;
    else if (docType.startsWith('Photos')) dailyMap[dateStr].formats['Photos'] += 1;
    else if (docType.startsWith('Text')) dailyMap[dateStr].formats['Text'] += 1;
    else dailyMap[dateStr].formats['Other'] += 1;

    // Daily device counter
    dailyMap[dateStr].devices[printer] = (dailyMap[dateStr].devices[printer] || 0) + 1;

    dailyMap[dateStr].jobList.push({
      token: job.pickupToken,
      customer: job.customerName,
      file: job.originalName,
      docType,
      pages: jobPages,
      copies,
      cost,
      printer,
      status: job.status,
      time: new Date(job.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Sort daily breakdown descending
  const dailyBreakdown = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

  // Format month label
  let monthLabel = 'All Time Records';
  if (activeMonth !== 'all') {
    const [year, month] = activeMonth.split('-');
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  return {
    month: activeMonth,
    monthLabel,
    availableMonths,
    availablePrinters,
    selectedPrinter: selectedPrinter || 'all',
    summary: {
      totalJobs,
      totalCompletedJobs,
      totalPrints,
      totalPages,
      totalRevenue,
      bwPages,
      colorPages,
      activeDays: dailyBreakdown.length,
      avgPrintsPerDay: dailyBreakdown.length > 0 ? (totalPages / dailyBreakdown.length).toFixed(1) : 0,
      avgRevenuePerDay: dailyBreakdown.length > 0 ? (totalRevenue / dailyBreakdown.length).toFixed(2) : 0
    },
    formatSummary: formatMap,
    deviceSummary: deviceMap,
    dailyBreakdown,
    recentJobs: filteredJobs.slice(0, 50)
  };
}

/**
 * Generate high-quality downloadable PDF report using pdf-lib
 */
async function generatePdfReport(reportData, shopSettings = {}) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // A4 Portrait (210 x 297 mm)
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const shopTitle = shopSettings.shopName || 'FastPrint Express';
  const counterName = shopSettings.counterName || 'Counter 01';

  // Palette
  const colorPrimary = rgb(0.09, 0.12, 0.22); // #171f38
  const colorAccent = rgb(0.39, 0.40, 0.95);  // #6366f1
  const colorDarkText = rgb(0.12, 0.16, 0.24);
  const colorMuted = rgb(0.40, 0.45, 0.55);
  const colorCardBg = rgb(0.96, 0.97, 0.99);
  const colorBorder = rgb(0.88, 0.90, 0.95);

  let y = height - 40;

  // Header Bar
  page.drawRectangle({
    x: 30,
    y: y - 55,
    width: width - 60,
    height: 65,
    color: colorPrimary,
    borderRadius: 6
  });

  page.drawText(shopTitle.toUpperCase(), {
    x: 45,
    y: y - 22,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  page.drawText(`PRINTING & DEVICE AUDIT REPORT • ${reportData.monthLabel.toUpperCase()}`, {
    x: 45,
    y: y - 38,
    size: 9,
    font: fontRegular,
    color: rgb(0.75, 0.80, 0.98)
  });

  const generatedTimeText = `Generated: ${new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })} | ${counterName}`;
  page.drawText(generatedTimeText, {
    x: width - 45 - fontRegular.widthOfTextAtSize(generatedTimeText, 8),
    y: y - 38,
    size: 8,
    font: fontRegular,
    color: rgb(0.70, 0.75, 0.85)
  });

  y -= 75;

  // 4 KPI Summary Cards
  const kpis = [
    { label: 'TOTAL PRINT JOBS', value: `${reportData.summary.totalJobs}`, sub: `${reportData.summary.totalCompletedJobs} Completed` },
    { label: 'PAGES PRINTED', value: `${reportData.summary.totalPages}`, sub: `B&W: ${reportData.summary.bwPages} | Color: ${reportData.summary.colorPages}` },
    { label: 'TOTAL REVENUE', value: `INR ${reportData.summary.totalRevenue.toFixed(2)}`, sub: `Avg/Day: INR ${reportData.summary.avgRevenuePerDay}` },
    { label: 'ACTIVE DAYS', value: `${reportData.summary.activeDays} Days`, sub: `${reportData.summary.avgPrintsPerDay} pages / day` }
  ];

  const cardWidth = (width - 60 - 30) / 4;
  kpis.forEach((kpi, idx) => {
    const cardX = 30 + idx * (cardWidth + 10);
    page.drawRectangle({
      x: cardX,
      y: y - 48,
      width: cardWidth,
      height: 52,
      color: colorCardBg,
      borderColor: colorBorder,
      borderWidth: 1,
      borderRadius: 4
    });

    page.drawText(kpi.label, {
      x: cardX + 8,
      y: y - 12,
      size: 6.5,
      font: fontBold,
      color: colorMuted
    });

    page.drawText(kpi.value, {
      x: cardX + 8,
      y: y - 28,
      size: 13,
      font: fontBold,
      color: colorAccent
    });

    page.drawText(kpi.sub, {
      x: cardX + 8,
      y: y - 42,
      size: 6.5,
      font: fontRegular,
      color: colorDarkText
    });
  });

  y -= 68;

  // Breakdown Section: Formats & Devices
  page.drawText('DOCUMENT FORMAT & DEVICE BREAKDOWN', {
    x: 30,
    y: y,
    size: 10,
    font: fontBold,
    color: colorDarkText
  });
  y -= 16;

  // Box with format and device stats
  page.drawRectangle({
    x: 30,
    y: y - 38,
    width: width - 60,
    height: 42,
    color: rgb(0.98, 0.98, 1),
    borderColor: colorBorder,
    borderWidth: 1
  });

  const formatsStr = Object.entries(reportData.formatSummary)
    .filter(([_, v]) => v.count > 0)
    .map(([k, v]) => `${k}: ${v.count} (${v.pages} pgs)`)
    .join('  •  ') || 'None recorded';

  const devicesStr = Object.entries(reportData.deviceSummary)
    .map(([k, v]) => `${k}: ${v.jobs} prints (${v.pages} pgs)`)
    .join('  •  ') || 'No devices';

  page.drawText(`Formats:  ${formatsStr}`, {
    x: 40,
    y: y - 16,
    size: 7.5,
    font: fontRegular,
    color: colorDarkText
  });

  page.drawText(`Printers: ${devicesStr}`, {
    x: 40,
    y: y - 30,
    size: 7.5,
    font: fontRegular,
    color: colorDarkText
  });

  y -= 54;

  // Daily Printing Breakdown Table
  page.drawText('DAY-BY-DAY AUDIT TRAIL', {
    x: 30,
    y: y,
    size: 10,
    font: fontBold,
    color: colorDarkText
  });
  y -= 14;

  // Table Headers
  const colX = [30, 110, 155, 235, 335, 435, 505];
  const colHeaders = ['Date', 'Jobs', 'Pages', 'B&W / Color', 'File Formats', 'Device', 'Revenue'];

  page.drawRectangle({
    x: 30,
    y: y - 16,
    width: width - 60,
    height: 18,
    color: colorPrimary
  });

  colHeaders.forEach((hdr, idx) => {
    page.drawText(hdr, {
      x: colX[idx] + 4,
      y: y - 12,
      size: 7.5,
      font: fontBold,
      color: rgb(1, 1, 1)
    });
  });

  y -= 20;

  // Table Rows
  if (reportData.dailyBreakdown.length === 0) {
    page.drawText('No print jobs recorded in this billing cycle.', {
      x: 35,
      y: y - 15,
      size: 8,
      font: fontRegular,
      color: colorMuted
    });
    y -= 25;
  } else {
    reportData.dailyBreakdown.forEach((day, rIdx) => {
      // Check page overflow
      if (y < 60) {
        page = pdfDoc.addPage([595.28, 841.89]);
        y = height - 40;
        // Re-draw small header
        page.drawRectangle({ x: 30, y: y - 14, width: width - 60, height: 16, color: colorPrimary });
        colHeaders.forEach((hdr, idx) => {
          page.drawText(hdr, { x: colX[idx] + 4, y: y - 10, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
        });
        y -= 18;
      }

      const isEven = rIdx % 2 === 0;
      if (isEven) {
        page.drawRectangle({
          x: 30,
          y: y - 14,
          width: width - 60,
          height: 16,
          color: rgb(0.97, 0.98, 1)
        });
      }

      // Format string
      const fmtList = Object.entries(day.formats)
        .filter(([_, cnt]) => cnt > 0)
        .map(([k, cnt]) => `${k}:${cnt}`)
        .join(', ');

      const deviceList = Object.keys(day.devices).join(', ') || 'Canon MF3010';

      page.drawText(`${day.formattedDate}`, { x: colX[0] + 4, y: y - 10, size: 7, font: fontBold, color: colorDarkText });
      page.drawText(`${day.jobsCount}`, { x: colX[1] + 4, y: y - 10, size: 7, font: fontRegular, color: colorDarkText });
      page.drawText(`${day.pagesPrinted} pgs`, { x: colX[2] + 4, y: y - 10, size: 7, font: fontBold, color: colorAccent });
      page.drawText(`${day.bwPages} BW / ${day.colorPages} Col`, { x: colX[3] + 4, y: y - 10, size: 7, font: fontRegular, color: colorDarkText });
      page.drawText(fmtList.substring(0, 24), { x: colX[4] + 4, y: y - 10, size: 6.5, font: fontRegular, color: colorMuted });
      page.drawText(deviceList.substring(0, 16), { x: colX[5] + 4, y: y - 10, size: 6.5, font: fontRegular, color: colorDarkText });
      page.drawText(`INR ${day.revenue.toFixed(2)}`, { x: colX[6] + 4, y: y - 10, size: 7, font: fontBold, color: rgb(0.06, 0.6, 0.4) });

      y -= 16;
    });
  }

  // Footer on current page
  page.drawText('FastPrint Express Automated Cloud & Windows Print Service • Confidential Shop Accounting Document', {
    x: 30,
    y: 20,
    size: 6.5,
    font: fontRegular,
    color: colorMuted
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Generate formatted CSV export
 */
function generateCsvReport(reportData, shopSettings = {}) {
  const lines = [];
  lines.push(`"Shop Name:","${shopSettings.shopName || 'FastPrint Express'}"`);
  lines.push(`"Report Period:","${reportData.monthLabel}"`);
  lines.push(`"Generated At:","${new Date().toISOString()}"`);
  lines.push(`"Total Jobs:","${reportData.summary.totalJobs}"`);
  lines.push(`"Total Pages:","${reportData.summary.totalPages}"`);
  lines.push(`"Total Revenue (INR):","${reportData.summary.totalRevenue.toFixed(2)}"`);
  lines.push('');
  lines.push('--- DAILY BREAKDOWN ---');
  lines.push('"Date","Day","Jobs","Pages Printed","B&W Pages","Color Pages","Revenue (INR)","Formats","Devices"');

  reportData.dailyBreakdown.forEach(d => {
    const fmts = Object.entries(d.formats).filter(([_, c]) => c > 0).map(([k, c]) => `${k}:${c}`).join('; ');
    const devs = Object.keys(d.devices).join('; ');
    lines.push(`"${d.date}","${d.dayName}","${d.jobsCount}","${d.pagesPrinted}","${d.bwPages}","${d.colorPages}","${d.revenue.toFixed(2)}","${fmts}","${devs}"`);
  });

  lines.push('');
  lines.push('--- INDIVIDUAL JOB RECORDS ---');
  lines.push('"Pickup Token","Customer","Document Name","Format","Copies","Printed Pages","Cost (INR)","Status","Printer","Created At"');

  reportData.recentJobs.forEach(j => {
    const docType = categorizeDocumentType(j.originalName, j.fileType);
    lines.push(`"${j.pickupToken}","${j.customerName || 'Guest'}","${(j.originalName || '').replace(/"/g, '""')}","${docType}","${j.options?.copies || 1}","${j.printedPages || 1}","${(j.totalCost || 0).toFixed(2)}","${j.status}","${j.printerName || 'Canon MF3010'}","${j.createdAt}"`);
  });

  // UTF-8 BOM so Excel opens it with proper encoding
  return '\uFEFF' + lines.join('\r\n');
}

module.exports = {
  categorizeDocumentType,
  generateMonthlyReportData,
  generatePdfReport,
  generateCsvReport
};
