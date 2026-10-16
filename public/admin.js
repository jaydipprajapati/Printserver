let adminState = {
  settings: null,
  jobs: [],
  printers: [],
  agents: [],
  activeFilter: 'all',
  searchQuery: '',
  ws: null,
  selectedReportMonth: '',
  selectedReportPrinter: 'all',
  currentReportData: null
};

// DOM references
const jobsTableBody = document.getElementById('jobsTableBody');
const autoPrintToggle = document.getElementById('autoPrintToggle');
const kpiTodayJobs = document.getElementById('kpiTodayJobs');
const kpiTodayPages = document.getElementById('kpiTodayPages');
const kpiTodayRevenue = document.getElementById('kpiTodayRevenue');
const kpiActivePrinter = document.getElementById('kpiActivePrinter');
const mobileUrlPill = document.getElementById('mobileUrlPill');
const agentIndicator = document.getElementById('agentIndicator');
const agentStatusText = document.getElementById('agentStatusText');
const printersList = document.getElementById('printersList');
const diagnosticPrinterSelect = document.getElementById('diagnosticPrinterSelect');
const btnTriggerTestPrint = document.getElementById('btnTriggerTestPrint');
const testPrintFeedback = document.getElementById('testPrintFeedback');
const jobSearchInput = document.getElementById('jobSearchInput');
const btnRefreshJobs = document.getElementById('btnRefreshJobs');
const standeeQrImg = document.getElementById('standeeQrImg');
const standeeShopTitle = document.getElementById('standeeShopTitle');
const customQrUrlInput = document.getElementById('customQrUrlInput');
const btnRegenerateQr = document.getElementById('btnRegenerateQr');
const btnDownloadQr = document.getElementById('btnDownloadQr');

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  initWebSocket();
  initReportControls();
  loadAllData();
  setupEventListeners();
});

// Setup Tab Navigation
function setupTabs() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = item.getAttribute('data-tab');

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      document.querySelectorAll('.admin-tab-content').forEach(tab => {
        tab.classList.toggle('active', tab.id === `tab-${tabId}`);
      });

      const titleMap = {
        overview: 'Live Print Jobs Queue',
        printers: 'Printers & Windows Agent',
        pricing: 'Pricing & Shop Tariff Settings',
        standee: 'Counter QR Standee Generator',
        reports: 'Monthly & Device Print Reports'
      };
      document.getElementById('pageTitle').textContent = titleMap[tabId] || 'Admin Dashboard';

      if (tabId === 'reports') {
        loadMonthlyReports();
      }
    });
  });
}

// Setup WebSocket
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  adminState.ws = new WebSocket(wsUrl);

  adminState.ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'JOB_CREATED') {
        adminState.jobs.unshift(msg.job);
        renderJobsTable();
        refreshReports();
        loadMonthlyReports();
      }

      if (msg.type === 'JOB_STATUS_UPDATED') {
        const idx = adminState.jobs.findIndex(j => j.id === msg.job.id);
        if (idx !== -1) {
          adminState.jobs[idx] = msg.job;
        } else {
          adminState.jobs.unshift(msg.job);
        }
        renderJobsTable();
        refreshReports();
        loadMonthlyReports();
      }

      if (msg.type === 'PRINTERS_UPDATED') {
        loadPrinters();
      }

      if (msg.type === 'SETTINGS_UPDATED') {
        adminState.settings = msg.settings;
        populateSettingsForm(msg.settings);
      }
    } catch (e) {
      console.error('WS error:', e);
    }
  };

  adminState.ws.onclose = () => {
    setTimeout(initWebSocket, 3000);
  };
}

// Load All Initial Admin Data
async function loadAllData() {
  await Promise.all([
    loadSettings(),
    loadJobs(),
    loadPrinters(),
    refreshReports(),
    loadMonthlyReports(),
    loadQrData()
  ]);
}

// Load Settings
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    if (data.success) {
      adminState.settings = data.settings;
      populateSettingsForm(data.settings);
      autoPrintToggle.checked = data.settings.autoPrint;
      kpiActivePrinter.textContent = data.settings.defaultPrinter || 'Canon MF3010';
      mobileUrlPill.textContent = data.serverInfo.baseUrl;
      standeeShopTitle.textContent = data.settings.shopName;
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

// Populate Settings Form
function populateSettingsForm(s) {
  document.getElementById('settingShopName').value = s.shopName || '';
  document.getElementById('settingCounterName').value = s.counterName || '';
  document.getElementById('settingBwPrice').value = s.pricing?.bwPerPage || 2.0;
  document.getElementById('settingColorPrice').value = s.pricing?.colorPerPage || 10.0;
  document.getElementById('settingDuplexDiscount').value = s.pricing?.duplexDiscountPercent || 10;
  document.getElementById('settingRetention').value = s.retentionMinutes || 120;
}

// Load Jobs
async function loadJobs() {
  try {
    const res = await fetch('/api/admin/jobs?limit=100');
    const data = await res.json();
    if (data.success) {
      adminState.jobs = data.jobs || [];
      renderJobsTable();
    }
  } catch (err) {
    console.error('Error loading jobs:', err);
  }
}

// Load Printers & Agent Status
async function loadPrinters() {
  try {
    const res = await fetch('/api/admin/printers');
    const data = await res.json();
    if (data.success) {
      adminState.printers = data.printers || [];
      adminState.agents = data.agents || [];

      // Update agent connection indicator
      const hasOnlineAgent = adminState.agents.some(a => a.isOnline);
      agentIndicator.className = `agent-indicator ${hasOnlineAgent ? 'online' : ''}`;
      agentStatusText.textContent = hasOnlineAgent ? 'Online & Ready' : 'Offline (Start Agent)';

      renderPrintersList(data.defaultPrinter);
      updateReportDeviceOptions();
    }
  } catch (err) {
    console.error('Error loading printers:', err);
  }
}

// Render Printers List
function renderPrintersList(defaultPrinterName) {
  printersList.innerHTML = '';
  diagnosticPrinterSelect.innerHTML = '';

  if (adminState.printers.length === 0) {
    printersList.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-dim);">
        <p>No active Windows Print Agent connected.</p>
        <p style="font-size:0.8rem; margin-top:6px;">Run <code>scripts/start-agent.bat</code> to connect local printers.</p>
      </div>
    `;
    return;
  }

  adminState.printers.forEach(p => {
    const isDefault = p.name === defaultPrinterName || (p.name.includes('Canon') && !defaultPrinterName);
    const div = document.createElement('div');
    div.className = `printer-item ${isDefault ? 'default-printer' : ''}`;
    div.innerHTML = `
      <div class="printer-info">
        <h4>${p.name} ${isDefault ? '<span class="status-tag completed" style="margin-left:6px;">Default</span>' : ''}</h4>
        <div class="printer-meta">Port: ${p.portName} • Driver: ${p.driverName} • Status: ${p.printerStatus}</div>
      </div>
      <div>
        ${!isDefault ? `<button class="btn-action primary" onclick="setDefaultPrinter('${encodeURIComponent(p.name)}')">Set Default</button>` : ''}
      </div>
    `;
    printersList.appendChild(div);

    // Populate diagnostic select
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    if (isDefault) opt.selected = true;
    diagnosticPrinterSelect.appendChild(opt);
  });
}

// Set Default Printer
window.setDefaultPrinter = async (encodedName) => {
  const printerName = decodeURIComponent(encodedName);
  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultPrinter: printerName })
    });
    const data = await res.json();
    if (data.success) {
      kpiActivePrinter.textContent = printerName;
      loadPrinters();
    }
  } catch (err) {
    alert('Failed to set default printer');
  }
};

// Render Jobs Table
function renderJobsTable() {
  const query = adminState.searchQuery.toLowerCase();
  const filter = adminState.activeFilter;

  let filtered = adminState.jobs.filter(j => {
    const matchFilter = filter === 'all' || j.status === filter;
    const matchQuery = !query ||
      j.pickupToken.toLowerCase().includes(query) ||
      (j.customerName && j.customerName.toLowerCase().includes(query)) ||
      (j.originalName && j.originalName.toLowerCase().includes(query));
    return matchFilter && matchQuery;
  });

  if (filtered.length === 0) {
    jobsTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4" style="color:var(--text-dim);">No print jobs match your criteria.</td></tr>`;
    return;
  }

  jobsTableBody.innerHTML = filtered.map(j => `
    <tr>
      <td><span class="token-badge">${j.pickupToken}</span></td>
      <td>
        <div style="font-weight:600;">${escapeHtml(j.customerName || 'Guest')}</div>
        <div style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(j.customerPhone || '')}</div>
      </td>
      <td>
        <div style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(j.originalName)}">
          ${escapeHtml(j.originalName)}
        </div>
      </td>
      <td>
        <div>${j.options.copies} copy • ${j.printedPages} page(s)</div>
        <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase;">${j.options.colorMode} • ${j.options.paperSize}</div>
      </td>
      <td><strong style="color:#a5b4fc;">₹${(j.totalCost || 0).toFixed(2)}</strong></td>
      <td><span class="status-tag ${j.status}">${j.status}</span></td>
      <td style="font-size:0.78rem; color:var(--text-dim);">${new Date(j.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
      <td>
        <div class="action-btn-group">
          ${j.status !== 'printing' && j.status !== 'completed' ? `
            <button class="btn-action primary" onclick="adminPrintJob('${j.id}')">Print</button>
          ` : `
            <button class="btn-action" onclick="adminPrintJob('${j.id}')">Reprint</button>
          `}
          ${j.status !== 'completed' ? `
            <button class="btn-action" onclick="markJobStatus('${j.id}', 'completed')">Done</button>
          ` : ''}
          ${j.status !== 'cancelled' && j.status !== 'completed' ? `
            <button class="btn-action" onclick="markJobStatus('${j.id}', 'cancelled')">Cancel</button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

// Trigger Print from Admin
window.adminPrintJob = async (jobId) => {
  try {
    const res = await fetch(`/api/admin/jobs/${jobId}/print`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) {
      alert(`Print dispatch failed: ${data.error}`);
    }
  } catch (err) {
    alert('Failed to dispatch print command');
  }
};

// Update Job Status
window.markJobStatus = async (jobId, status) => {
  try {
    await fetch(`/api/admin/jobs/${jobId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
  } catch (err) {
    alert('Failed to update status');
  }
};

// Refresh Reports
async function refreshReports() {
  try {
    const res = await fetch('/api/admin/reports');
    const data = await res.json();
    if (data.success && data.today) {
      kpiTodayJobs.textContent = data.today.jobsCount;
      kpiTodayPages.textContent = data.today.pagesPrinted;
      kpiTodayRevenue.textContent = `₹${data.today.revenue.toFixed(2)}`;
    }
  } catch (err) {
    console.error('Reports error:', err);
  }
}

// Load QR Standee Data
async function loadQrData(customUrl = null) {
  try {
    const url = customUrl ? `/api/admin/qr?customUrl=${encodeURIComponent(customUrl)}` : '/api/admin/qr';
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      standeeQrImg.src = data.qrImage;
      customQrUrlInput.value = data.url;

      btnDownloadQr.onclick = () => {
        const a = document.createElement('a');
        a.href = data.qrImage;
        a.download = `FastPrint-QR-Standee.png`;
        a.click();
      };
    }
  } catch (err) {
    console.error('QR load error:', err);
  }
}

// Event Listeners
function setupEventListeners() {
  // Auto Print Toggle
  autoPrintToggle.addEventListener('change', async (e) => {
    const autoPrint = e.target.checked;
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoPrint })
    });
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      adminState.activeFilter = chip.getAttribute('data-filter');
      renderJobsTable();
    });
  });

  // Search input
  jobSearchInput.addEventListener('input', (e) => {
    adminState.searchQuery = e.target.value;
    renderJobsTable();
  });

  // Refresh button
  btnRefreshJobs.addEventListener('click', () => {
    loadJobs();
    refreshReports();
  });

  // Test Print Diagnostic
  btnTriggerTestPrint.addEventListener('click', async () => {
    const targetPrinter = diagnosticPrinterSelect.value;
    if (!targetPrinter) return alert('No printer selected');

    btnTriggerTestPrint.disabled = true;
    testPrintFeedback.className = 'test-feedback';
    testPrintFeedback.textContent = `Sending diagnostic page to "${targetPrinter}"...`;

    try {
      // Create a test print job
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: 'test_diagnostic',
          originalName: 'Hardware_Test_Page.pdf',
          customerName: 'Admin Hardware Test',
          options: {
            colorMode: 'bw',
            paperSize: 'A4',
            copies: 1
          }
        })
      });
      const data = await res.json();
      testPrintFeedback.textContent = `✅ Test page sent to "${targetPrinter}"! Check paper output tray.`;
    } catch (err) {
      testPrintFeedback.textContent = `❌ Test print failed: ${err.message}`;
    } finally {
      btnTriggerTestPrint.disabled = false;
    }
  });

  // Save Settings Form
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      shopName: document.getElementById('settingShopName').value.trim(),
      counterName: document.getElementById('settingCounterName').value.trim(),
      pricing: {
        bwPerPage: parseFloat(document.getElementById('settingBwPrice').value) || 2.0,
        colorPerPage: parseFloat(document.getElementById('settingColorPrice').value) || 10.0,
        paperMultipliers: { A4: 1.0, A3: 2.0, Letter: 1.0, Legal: 1.25 },
        duplexDiscountPercent: parseInt(document.getElementById('settingDuplexDiscount').value, 10) || 10
      },
      retentionMinutes: parseInt(document.getElementById('settingRetention').value, 10) || 120
    };

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('Settings saved successfully!');
        standeeShopTitle.textContent = payload.shopName;
      }
    } catch (err) {
      alert('Failed to save settings');
    }
  });

  // Regenerate QR
  btnRegenerateQr.addEventListener('click', () => {
    const customUrl = customQrUrlInput.value.trim();
    if (customUrl) loadQrData(customUrl);
  });

  // Report Export Listeners
  const btnPdf = document.getElementById('btnDownloadReportPdf');
  if (btnPdf) {
    btnPdf.addEventListener('click', () => {
      const month = document.getElementById('reportMonthSelect')?.value || new Date().toISOString().substring(0, 7);
      const printer = document.getElementById('reportDeviceSelect')?.value || 'all';
      window.open(`/api/admin/reports/export/pdf?month=${month}&printer=${encodeURIComponent(printer)}`, '_blank');
    });
  }

  const btnCsv = document.getElementById('btnDownloadReportCsv');
  if (btnCsv) {
    btnCsv.addEventListener('click', () => {
      const month = document.getElementById('reportMonthSelect')?.value || new Date().toISOString().substring(0, 7);
      const printer = document.getElementById('reportDeviceSelect')?.value || 'all';
      window.location.href = `/api/admin/reports/export/csv?month=${month}&printer=${encodeURIComponent(printer)}`;
    });
  }

  const btnPrintDirect = document.getElementById('btnPrintReportDirect');
  if (btnPrintDirect) {
    btnPrintDirect.addEventListener('click', async () => {
      const month = document.getElementById('reportMonthSelect')?.value || new Date().toISOString().substring(0, 7);
      const printer = document.getElementById('reportDeviceSelect')?.value || 'all';
      btnPrintDirect.disabled = true;
      try {
        const res = await fetch('/api/admin/reports/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, printer })
        });
        const data = await res.json();
        if (data.success) {
          alert(`✅ Monthly report dispatched for printing to "${data.targetPrinter}"!\nPickup Token: ${data.job?.pickupToken || ''}`);
        } else {
          alert(`❌ Print dispatch failed: ${data.error}`);
        }
      } catch (e) {
        alert(`Print error: ${e.message}`);
      } finally {
        btnPrintDirect.disabled = false;
      }
    });
  }
}

// Initialize Report Controls
function initReportControls() {
  const monthSelect = document.getElementById('reportMonthSelect');
  if (!monthSelect) return;
  monthSelect.innerHTML = '';
  
  const now = new Date();
  const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === currentMonthVal) opt.selected = true;
    monthSelect.appendChild(opt);
  }

  monthSelect.addEventListener('change', () => {
    loadMonthlyReports();
  });

  const deviceSelect = document.getElementById('reportDeviceSelect');
  if (deviceSelect) {
    deviceSelect.addEventListener('change', () => {
      loadMonthlyReports();
    });
  }
}

// Update Report Device Dropdown
function updateReportDeviceOptions() {
  const deviceSelect = document.getElementById('reportDeviceSelect');
  if (!deviceSelect) return;
  const currentVal = deviceSelect.value || 'all';
  deviceSelect.innerHTML = '<option value="all">All Printers & Devices</option>';
  adminState.printers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    if (p.name === currentVal) opt.selected = true;
    deviceSelect.appendChild(opt);
  });
}

// Fetch & Populate Monthly Report
async function loadMonthlyReports(month = null, printer = null) {
  const monthSelect = document.getElementById('reportMonthSelect');
  const deviceSelect = document.getElementById('reportDeviceSelect');
  const selectedMonth = month || (monthSelect ? monthSelect.value : new Date().toISOString().substring(0, 7));
  const selectedPrinter = printer || (deviceSelect ? deviceSelect.value : 'all');

  adminState.selectedReportMonth = selectedMonth;
  adminState.selectedReportPrinter = selectedPrinter;

  const dailyReportTableBody = document.getElementById('dailyReportTableBody');
  if (dailyReportTableBody) {
    dailyReportTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4" style="color:var(--text-dim);">Aggregating monthly report...</td></tr>`;
  }

  try {
    const res = await fetch(`/api/admin/reports/monthly?month=${selectedMonth}&printer=${encodeURIComponent(selectedPrinter)}`);
    const data = await res.json();
    if (data.success && data.summary) {
      adminState.currentReportData = data;

      // Update month select options if availableMonths returned
      if (data.availableMonths && data.availableMonths.length > 0 && monthSelect) {
        const currentSelected = monthSelect.value;
        const existingValues = Array.from(monthSelect.options).map(o => o.value);
        data.availableMonths.forEach(m => {
          if (!existingValues.includes(m.month)) {
            const opt = document.createElement('option');
            opt.value = m.month;
            opt.textContent = m.label;
            monthSelect.appendChild(opt);
          }
        });
        if (currentSelected) monthSelect.value = currentSelected;
      }

      // Update device select options if availablePrinters returned
      if (data.availablePrinters && data.availablePrinters.length > 0 && deviceSelect) {
        const currentDev = deviceSelect.value;
        const existingDevs = Array.from(deviceSelect.options).map(o => o.value);
        data.availablePrinters.forEach(pName => {
          if (!existingDevs.includes(pName)) {
            const opt = document.createElement('option');
            opt.value = pName;
            opt.textContent = pName;
            deviceSelect.appendChild(opt);
          }
        });
        if (currentDev) deviceSelect.value = currentDev;
      }

      renderReportDashboard(data);
    }
  } catch (err) {
    console.error('Error loading monthly report:', err);
    if (dailyReportTableBody) {
      dailyReportTableBody.innerHTML = `<tr><td colspan="8" class="text-center py-4" style="color:var(--danger-color);">Failed to load monthly reports.</td></tr>`;
    }
  }
}

// Render Report Dashboard
function renderReportDashboard(data) {
  const summary = data.summary || {};

  // Update KPI Cards
  const repTotalJobs = document.getElementById('repKpiTotalJobs');
  const repTotalPages = document.getElementById('repKpiTotalPages');
  const repTotalRevenue = document.getElementById('repKpiTotalRevenue');
  const repDailyAvg = document.getElementById('repKpiDailyAvg');
  const repActiveDays = document.getElementById('repActiveDaysBadge');

  if (repTotalJobs) repTotalJobs.textContent = summary.totalJobs || 0;
  if (repTotalPages) repTotalPages.textContent = summary.totalPages || 0;
  if (repTotalRevenue) repTotalRevenue.textContent = `₹${(summary.totalRevenue || 0).toFixed(2)}`;
  if (repDailyAvg) repDailyAvg.textContent = `${summary.avgPrintsPerDay || 0} pgs/day`;
  if (repActiveDays) repActiveDays.textContent = `${summary.activeDays || 0} Active Days`;

  // Render Breakdown Visualizations
  renderFormatBreakdown(data.formatSummary, summary.totalJobs);
  renderDeviceBreakdown(data.deviceSummary, summary.totalJobs);

  // Render Daily Audit Table
  renderDailyReportTable(data.dailyBreakdown || []);
}

// Render Format Breakdown
function renderFormatBreakdown(formatSummary, totalJobs) {
  const container = document.getElementById('formatBreakdownBars');
  if (!container) return;

  const meta = [
    { key: 'PDF', label: 'PDF Documents (.pdf)', colorClass: 'fill-cyan', icon: '📄' },
    { key: 'Word (.docx)', label: 'Word Documents (.docx)', colorClass: 'fill-emerald', icon: '📝' },
    { key: 'Excel (.xlsx)', label: 'Excel Spreadsheets (.xlsx)', colorClass: 'fill-purple', icon: '📊' },
    { key: 'Photos / Images', label: 'Photos / Images (.jpg, .png)', colorClass: 'fill-amber', icon: '🖼️' },
    { key: 'Text (.txt)', label: 'Text & Invoices (.txt)', colorClass: '', icon: '📃' },
    { key: 'Other', label: 'Other Document Formats', colorClass: '', icon: '📁' }
  ];

  const html = meta.map(m => {
    const item = formatSummary && formatSummary[m.key] ? formatSummary[m.key] : { count: 0, pages: 0 };
    const percentage = totalJobs > 0 ? Math.round((item.count / totalJobs) * 100) : 0;
    return `
      <div class="bar-item">
        <div class="bar-header">
          <span class="bar-label">${m.icon} ${m.label}</span>
          <span class="bar-val">${item.count} jobs • ${item.pages} pgs (${percentage}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill ${m.colorClass}" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// Render Device Utilization Breakdown
function renderDeviceBreakdown(deviceSummary, totalJobs) {
  const container = document.getElementById('deviceBreakdownBars');
  if (!container) return;

  const devices = Object.keys(deviceSummary || {});
  if (devices.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim); font-size:0.8rem; padding: 10px 0;">No device activity recorded for this period.</div>`;
    return;
  }

  const html = devices.map(devName => {
    const d = deviceSummary[devName];
    const jobCount = d.jobs || d.count || 0;
    const percentage = totalJobs > 0 ? Math.round((jobCount / totalJobs) * 100) : 0;
    return `
      <div class="bar-item">
        <div class="bar-header">
          <span class="bar-label">🖨️ ${escapeHtml(devName)}</span>
          <span class="bar-val">${jobCount} jobs • ${d.pages} pgs • ₹${(d.revenue || 0).toFixed(2)} (${percentage}%)</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill fill-emerald" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// Render Daily Print Log Table
function renderDailyReportTable(days) {
  const tbody = document.getElementById('dailyReportTableBody');
  if (!tbody) return;

  if (days.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4" style="color:var(--text-dim);">No print activity for this month.</td></tr>`;
    return;
  }

  tbody.innerHTML = days.map(day => {
    let formatBadges = [];
    if (day.formats && day.formats.PDF) formatBadges.push(`<span class="format-chip chip-pdf">PDF: ${day.formats.PDF}</span>`);
    if (day.formats && day.formats.Word) formatBadges.push(`<span class="format-chip chip-word">DOCX: ${day.formats.Word}</span>`);
    if (day.formats && day.formats.Excel) formatBadges.push(`<span class="format-chip chip-excel">XLSX: ${day.formats.Excel}</span>`);
    if (day.formats && day.formats.Photos) formatBadges.push(`<span class="format-chip chip-image">IMG: ${day.formats.Photos}</span>`);
    if (day.formats && day.formats.Text) formatBadges.push(`<span class="format-chip chip-text">TXT: ${day.formats.Text}</span>`);
    if (day.formats && day.formats.Other) formatBadges.push(`<span class="format-chip chip-text">Other: ${day.formats.Other}</span>`);
    const formatsHtml = formatBadges.length > 0 ? formatBadges.join(' ') : '<span style="color:var(--text-dim);">-</span>';

    const primaryDevice = Object.keys(day.devices || {})[0] || '-';
    const isToday = new Date().toISOString().substring(0, 10) === day.date;

    return `
      <tr style="${day.jobsCount > 0 ? 'background: rgba(99, 102, 241, 0.03);' : 'opacity: 0.7;'}">
        <td>
          <strong style="color: ${day.jobsCount > 0 ? '#fff' : 'var(--text-dim)'};">${day.date}</strong>
          ${isToday ? '<span class="status-tag queued" style="margin-left: 4px; font-size: 0.6rem; padding: 1px 5px;">Today</span>' : ''}
        </td>
        <td><span style="color: var(--text-muted); font-size: 0.78rem;">${day.dayName}</span></td>
        <td><span class="token-badge" style="background: ${day.jobsCount > 0 ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)'}; color: ${day.jobsCount > 0 ? '#a5b4fc' : 'var(--text-dim)'}">${day.jobsCount} jobs</span></td>
        <td><strong style="color: #34d399;">${day.pagesPrinted}</strong> <span style="font-size:0.75rem; color:var(--text-dim);">pages</span></td>
        <td style="font-size:0.78rem;">${day.bwPages} BW / ${day.colorPages} Col</td>
        <td>${formatsHtml}</td>
        <td style="font-size:0.78rem; color:var(--text-dim);">
          <div style="max-width:140px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(primaryDevice)}">
            ${escapeHtml(primaryDevice)}
          </div>
        </td>
        <td><strong style="color: #a5b4fc;">₹${(day.revenue || 0).toFixed(2)}</strong></td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
