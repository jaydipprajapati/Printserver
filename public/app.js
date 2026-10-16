// PDF.js worker configuration
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// State management
let state = {
  currentFile: null,
  currentJob: null,
  activePdfDoc: null,
  currentPreviewPage: 1,
  totalPreviewPages: 1,
  pricingSettings: null,
  ws: null,
  previewCollapsed: false
};

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const cameraInput = document.getElementById('cameraInput');
const btnTriggerBrowse = document.getElementById('btnTriggerBrowse');
const btnTriggerCamera = document.getElementById('btnTriggerCamera');
const uploadSection = document.getElementById('uploadSection');
const configSection = document.getElementById('configSection');
const statusSection = document.getElementById('statusSection');
const uploadProgressOverlay = document.getElementById('uploadProgressOverlay');
const uploadProgressBar = document.getElementById('uploadProgressBar');
const progressStatusText = document.getElementById('progressStatusText');

// Preview Elements
const previewViewport = document.getElementById('previewViewport');
const btnTogglePreview = document.getElementById('btnTogglePreview');
const togglePreviewText = document.getElementById('togglePreviewText');
const togglePreviewIcon = document.getElementById('togglePreviewIcon');
const pdfCanvas = document.getElementById('pdfCanvas');
const imgPreview = document.getElementById('imgPreview');
const previewSpinner = document.getElementById('previewSpinner');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');
const previewSpecBadge = document.getElementById('previewSpecBadge');
const previewSheetTag = document.getElementById('previewSheetTag');

// Form Elements
const displayFileName = document.getElementById('displayFileName');
const displayFileSize = document.getElementById('displayFileSize');
const displayPageCount = document.getElementById('displayPageCount');
const btnChangeFile = document.getElementById('btnChangeFile');
const paperSizeSelect = document.getElementById('paperSizeSelect');
const orientationSelect = document.getElementById('orientationSelect');
const copiesInput = document.getElementById('copiesInput');
const btnMinusCopy = document.getElementById('btnMinusCopy');
const btnPlusCopy = document.getElementById('btnPlusCopy');
const rangeAllCount = document.getElementById('rangeAllCount');
const customRangeBox = document.getElementById('customRangeBox');
const customRangeInput = document.getElementById('customRangeInput');
const customerNameInput = document.getElementById('customerNameInput');
const customerPhoneInput = document.getElementById('customerPhoneInput');
const totalPriceDisplay = document.getElementById('totalPriceDisplay');
const priceBreakdownText = document.getElementById('priceBreakdownText');
const btnConfirmPrint = document.getElementById('btnConfirmPrint');
const btnPrintAnother = document.getElementById('btnPrintAnother');

// Status Tracking Elements
const pickupTokenValue = document.getElementById('pickupTokenValue');
const liveStatusTickerText = document.getElementById('liveStatusTickerText');
const statusPrinterName = document.getElementById('statusPrinterName');
const statusDocName = document.getElementById('statusDocName');
const statusCopiesPages = document.getElementById('statusCopiesPages');
const statusTotalAmount = document.getElementById('statusTotalAmount');
const statusPulseIcon = document.getElementById('statusPulseIcon');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  parseUrlParams();
  initWebSocket();
  setupEventListeners();
  loadServerInfo();
});

// Setup Dark/Light Theme
function initTheme() {
  const saved = localStorage.getItem('qrprint_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('qrprint_theme', next);
    });
  }
}

// Parse URL for Shop / Counter details from QR Code
function parseUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const shop = urlParams.get('shop');
  const counter = urlParams.get('counter');

  if (shop) document.getElementById('shopTitle').textContent = decodeURIComponent(shop);
  if (counter) document.getElementById('counterBadge').textContent = decodeURIComponent(counter);
}

// Fetch Server Settings & Rates
async function loadServerInfo() {
  try {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    if (data.success && data.settings) {
      state.pricingSettings = data.settings.pricing;
      document.getElementById('bwRateHint').textContent = `₹${data.settings.pricing.bwPerPage.toFixed(2)} / page`;
      document.getElementById('colorRateHint').textContent = `₹${data.settings.pricing.colorPerPage.toFixed(2)} / page`;
      document.getElementById('duplexDiscountHint').textContent = `Save ${data.settings.pricing.duplexDiscountPercent}%`;
    }
  } catch (err) {
    console.warn('Could not load server settings:', err);
  }
}

// WebSocket for real-time status and printer updates
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    setPrinterStatus(true, 'Printer Ready');
  };

  state.ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'PRINTERS_UPDATED') {
        const hasOnline = msg.printers && msg.printers.some(p => p.isOnline);
        setPrinterStatus(hasOnline, hasOnline ? 'Printer Ready' : 'Agent Offline');
      }

      if (msg.type === 'JOB_STATUS_UPDATED' && state.currentJob && msg.job.id === state.currentJob.id) {
        updateJobProgress(msg.job);
      }
    } catch (e) {
      console.error('WS Error:', e);
    }
  };

  state.ws.onclose = () => {
    setPrinterStatus(false, 'Reconnecting...');
    setTimeout(initWebSocket, 3000);
  };
}

function setPrinterStatus(online, text) {
  const badge = document.getElementById('serverStatusBadge');
  const txt = document.getElementById('serverStatusText');
  if (badge && txt) {
    badge.className = `status-indicator ${online ? 'online' : 'offline'}`;
    txt.textContent = text;
  }
}

// Setup UI Event Listeners
function setupEventListeners() {
  // Mobile upload buttons
  if (btnTriggerBrowse) {
    btnTriggerBrowse.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (btnTriggerCamera) {
    btnTriggerCamera.addEventListener('click', (e) => {
      e.stopPropagation();
      cameraInput.click();
    });
  }

  if (cameraInput) {
    cameraInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
    });
  }

  // Dropzone drag & drop
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileUpload(files[0]);
  });

  fileInput.addEventListener('click', () => {
    fileInput.value = '';
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
  });

  if (cameraInput) {
    cameraInput.addEventListener('click', () => {
      cameraInput.value = '';
    });
  }

  btnChangeFile.addEventListener('click', () => {
    configSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    const welcomeBanner = document.getElementById('welcomeBanner');
    if (welcomeBanner) welcomeBanner.classList.remove('hidden');

    fileInput.value = '';
    if (cameraInput) cameraInput.value = '';
    state.currentFile = null;
    state.activePdfDoc = null;
    resetConfirmButton();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Toggle Preview Accordion
  if (btnTogglePreview) {
    btnTogglePreview.addEventListener('click', () => {
      state.previewCollapsed = !state.previewCollapsed;
      previewViewport.classList.toggle('collapsed', state.previewCollapsed);
      togglePreviewText.textContent = state.previewCollapsed ? 'Show Preview' : 'Collapse';
      btnTogglePreview.setAttribute('aria-expanded', !state.previewCollapsed);
      togglePreviewIcon.style.transform = state.previewCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
      if (!state.previewCollapsed && state.activePdfDoc) {
        renderPdfPage(state.currentPreviewPage);
      }
    });
  }

  // Option toggles (Radio cards)
  document.querySelectorAll('input[name="colorMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('input[name="colorMode"]').forEach(r => {
        r.closest('.option-card').classList.toggle('active', r.checked);
      });
      updatePreviewBadges();
      recalculatePrice();
    });
  });

  document.querySelectorAll('input[name="duplexMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('input[name="duplexMode"]').forEach(r => {
        r.closest('.option-card').classList.toggle('active', r.checked);
      });
      recalculatePrice();
    });
  });

  // Paper & Orientation selects: IMMEDIATELY update preview
  paperSizeSelect.addEventListener('change', () => {
    if (state.activePdfDoc && !state.previewCollapsed) {
      renderPdfPage(state.currentPreviewPage);
    } else {
      updateImagePreviewSheet();
    }
    recalculatePrice();
  });

  orientationSelect.addEventListener('change', () => {
    if (state.activePdfDoc && !state.previewCollapsed) {
      renderPdfPage(state.currentPreviewPage);
    } else {
      updateImagePreviewSheet();
    }
    recalculatePrice();
  });

  // Stepper controls
  btnMinusCopy.addEventListener('click', () => {
    let val = parseInt(copiesInput.value, 10) || 1;
    if (val > 1) {
      copiesInput.value = val - 1;
      recalculatePrice();
    }
  });

  btnPlusCopy.addEventListener('click', () => {
    let val = parseInt(copiesInput.value, 10) || 1;
    if (val < 100) {
      copiesInput.value = val + 1;
      recalculatePrice();
    }
  });

  copiesInput.addEventListener('input', () => {
    let val = parseInt(copiesInput.value, 10);
    if (isNaN(val) || val < 1) copiesInput.value = 1;
    if (val > 100) copiesInput.value = 100;
    recalculatePrice();
  });

  document.querySelectorAll('.chip-copy').forEach(chip => {
    chip.addEventListener('click', () => {
      copiesInput.value = chip.getAttribute('data-copies');
      recalculatePrice();
    });
  });

  // Range radio
  document.querySelectorAll('input[name="rangeType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const isCustom = document.querySelector('input[name="rangeType"]:checked').value === 'custom';
      customRangeBox.classList.toggle('hidden', !isCustom);
      recalculatePrice();
    });
  });

  customRangeInput.addEventListener('input', recalculatePrice);

  // Pager controls
  prevPageBtn.addEventListener('click', () => {
    if (state.currentPreviewPage > 1) {
      state.currentPreviewPage--;
      renderPdfPage(state.currentPreviewPage);
    }
  });

  nextPageBtn.addEventListener('click', () => {
    if (state.currentPreviewPage < state.totalPreviewPages) {
      state.currentPreviewPage++;
      renderPdfPage(state.currentPreviewPage);
    }
  });

  // Confirm Print Action
  btnConfirmPrint.addEventListener('click', submitPrintJob);

  // Print Another Action
  btnPrintAnother.addEventListener('click', () => {
    statusSection.classList.add('hidden');
    uploadSection.classList.remove('hidden');
    const welcomeBanner = document.getElementById('welcomeBanner');
    if (welcomeBanner) welcomeBanner.classList.remove('hidden');

    fileInput.value = '';
    if (cameraInput) cameraInput.value = '';
    state.currentFile = null;
    state.currentJob = null;
    state.activePdfDoc = null;

    // Reset preview canvas / image
    try {
      const ctx = pdfCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
      imgPreview.src = '';
      imgPreview.classList.add('hidden');
    } catch (_) {}

    // Reset stepper & range inputs
    copiesInput.value = 1;
    customRangeInput.value = '';
    const allRangeRadio = document.querySelector('input[name="rangeType"][value="all"]');
    if (allRangeRadio) {
      allRangeRadio.checked = true;
      customRangeBox.classList.add('hidden');
    }

    // Always re-enable Confirm & Print button
    resetConfirmButton();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Handle Window Resize with debounce to adjust PDF preview canvas dynamically
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.activePdfDoc && !state.previewCollapsed) {
        renderPdfPage(state.currentPreviewPage);
      } else {
        updateImagePreviewSheet();
      }
    }, 250);
  });
}

// Re-enable and restore Confirm & Print button to active state
function resetConfirmButton() {
  if (!btnConfirmPrint) return;
  btnConfirmPrint.disabled = false;
  btnConfirmPrint.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"></polyline>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
      <rect x="6" y="14" width="12" height="8"></rect>
    </svg>
    <span>Confirm & Print</span>
  `;
}

// Upload File via XMLHttpRequest for Progress Feedback
function handleFileUpload(file) {
  if (file.size > 50 * 1024 * 1024) {
    alert('File size exceeds the 50MB limit. Please choose a smaller file.');
    return;
  }

  uploadProgressOverlay.classList.remove('hidden');
  uploadProgressBar.style.width = '0%';
  progressStatusText.textContent = 'Uploading document...';

  const formData = new FormData();
  formData.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload', true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 90);
      uploadProgressBar.style.width = `${percent}%`;
    }
  };

  xhr.onload = async () => {
    uploadProgressBar.style.width = '100%';
    progressStatusText.textContent = 'Analyzing & preparing print preview...';

    if (xhr.status === 200) {
      try {
        const response = JSON.parse(xhr.responseText);
        if (response.success && response.file) {
          state.currentFile = response.file;
          setTimeout(() => {
            uploadProgressOverlay.classList.add('hidden');
            showConfigSection(response.file);
          }, 300);
        } else {
          throw new Error(response.error || 'Upload error');
        }
      } catch (err) {
        alert(err.message || 'Error processing response');
        uploadProgressOverlay.classList.add('hidden');
      }
    } else {
      alert(`Upload failed: ${xhr.statusText}`);
      uploadProgressOverlay.classList.add('hidden');
    }
  };

  xhr.onerror = () => {
    alert('Network error while uploading file.');
    uploadProgressOverlay.classList.add('hidden');
  };

  xhr.send(formData);
}

// Display Configuration View
function showConfigSection(file) {
  uploadSection.classList.add('hidden');
  const welcomeBanner = document.getElementById('welcomeBanner');
  if (welcomeBanner) welcomeBanner.classList.add('hidden');
  configSection.classList.remove('hidden');

  // CRITICAL: Always reset Confirm & Print button so customer can print repeatedly
  resetConfirmButton();

  displayFileName.textContent = file.originalName;
  displayFileSize.textContent = formatBytes(file.fileSize);
  displayPageCount.textContent = `${file.pageCount} ${file.pageCount === 1 ? 'Page' : 'Pages'}`;
  rangeAllCount.textContent = file.pageCount;

  const ext = file.fileType.replace('.', '').toUpperCase();
  document.getElementById('fileIconBox').textContent = ext || 'DOC';

  // Smooth scroll to config on mobile
  setTimeout(() => {
    configSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);

  // Load preview
  loadPreview(file);
  recalculatePrice();
}

// Paper Dimensions & Standard Ratios (mm)
const PAPER_SPECS = {
  A4: { name: 'A4', widthMm: 210, heightMm: 297 },
  A3: { name: 'A3', widthMm: 297, heightMm: 420 },
  Letter: { name: 'Letter', widthMm: 215.9, heightMm: 279.4 },
  Legal: { name: 'Legal', widthMm: 215.9, heightMm: 355.6 }
};

let currentRenderTask = null;

function getPaperSheetGeometry() {
  const paperKey = (paperSizeSelect ? paperSizeSelect.value : 'A4') || 'A4';
  const spec = PAPER_SPECS[paperKey] || PAPER_SPECS.A4;
  const isLandscape = (orientationSelect ? orientationSelect.value : 'portrait') === 'landscape';

  const sheetWidthMm = isLandscape ? spec.heightMm : spec.widthMm;
  const sheetHeightMm = isLandscape ? spec.widthMm : spec.heightMm;
  const ratio = sheetWidthMm / sheetHeightMm;

  return {
    paperKey,
    paperName: spec.name,
    isLandscape,
    sheetWidthMm,
    sheetHeightMm,
    ratio,
    dimensionLabel: isLandscape ? `${Math.round(spec.heightMm)} × ${Math.round(spec.widthMm)} mm` : `${Math.round(spec.widthMm)} × ${Math.round(spec.heightMm)} mm`
  };
}

function updatePreviewBadges() {
  const geo = getPaperSheetGeometry();
  const colorRadio = document.querySelector('input[name="colorMode"]:checked');
  const colorMode = colorRadio ? colorRadio.value : 'bw';
  const colorText = colorMode === 'bw' ? 'B&W' : 'Color';

  if (previewSpecBadge) {
    previewSpecBadge.textContent = `${geo.paperName} • ${geo.isLandscape ? 'Landscape' : 'Portrait'} • ${colorText}`;
  }
  if (previewSheetTag) {
    previewSheetTag.textContent = `${geo.paperName} (${geo.dimensionLabel}) • ${geo.isLandscape ? 'Landscape' : 'Portrait'}`;
  }

  // Update canvas & image grayscale/color filter
  if (pdfCanvas) {
    pdfCanvas.style.filter = colorMode === 'bw' ? 'grayscale(100%) contrast(105%)' : 'none';
  }
  if (imgPreview) {
    imgPreview.style.filter = colorMode === 'bw' ? 'grayscale(100%) contrast(105%)' : 'none';
  }
}

function updateImagePreviewSheet() {
  if (!imgPreview || imgPreview.classList.contains('hidden')) return;

  const geo = getPaperSheetGeometry();
  updatePreviewBadges();

  const containerW = previewViewport ? Math.max(220, previewViewport.clientWidth - 28) : 280;
  const maxH = 340;

  let displayW, displayH;
  if (geo.ratio >= containerW / maxH) {
    displayW = Math.min(containerW, 440);
    displayH = Math.round(displayW / geo.ratio);
  } else {
    displayH = maxH;
    displayW = Math.round(displayH * geo.ratio);
  }

  imgPreview.style.width = `${displayW}px`;
  imgPreview.style.height = `${displayH}px`;
}

// Load Preview with PDF.js or Image Tag
async function loadPreview(file) {
  previewSpinner.classList.remove('hidden');
  pdfCanvas.classList.remove('hidden');
  imgPreview.classList.add('hidden');

  try {
    const loadingTask = pdfjsLib.getDocument(file.previewUrl);
    state.activePdfDoc = await loadingTask.promise;
    state.totalPreviewPages = state.activePdfDoc.numPages;
    state.currentPreviewPage = 1;

    // Detect natural orientation from first page
    try {
      const firstPage = await state.activePdfDoc.getPage(1);
      const unscaled = firstPage.getViewport({ scale: 1.0 });
      if (orientationSelect) {
        orientationSelect.value = (unscaled.width > unscaled.height) ? 'landscape' : 'portrait';
      }
    } catch (_) {}

    updatePagerControls();
    await renderPdfPage(1);
  } catch (err) {
    console.error('Error rendering preview:', err);
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(file.fileType)) {
      pdfCanvas.classList.add('hidden');
      imgPreview.classList.remove('hidden');
      imgPreview.src = file.previewUrl;
      pageIndicator.textContent = 'Image Preview';
      updateImagePreviewSheet();
    }
  } finally {
    previewSpinner.classList.add('hidden');
  }
}

// Render specific page on canvas with responsive dynamic paper sheet simulation
async function renderPdfPage(pageNum) {
  if (!state.activePdfDoc || state.previewCollapsed) return;

  // Cancel any active rendering to prevent collisions when user toggles settings rapidly
  if (currentRenderTask) {
    try {
      currentRenderTask.cancel();
    } catch (_) {}
    currentRenderTask = null;
  }

  previewSpinner.classList.remove('hidden');

  try {
    const geo = getPaperSheetGeometry();
    updatePreviewBadges();

    // 1. Calculate CSS display dimensions for the simulated paper sheet
    const containerW = previewViewport ? Math.max(220, previewViewport.clientWidth - 28) : 280;
    const maxH = 340;

    let displayW, displayH;
    if (geo.ratio >= containerW / maxH) {
      displayW = Math.min(containerW, 440);
      displayH = Math.round(displayW / geo.ratio);
    } else {
      displayH = maxH;
      displayW = Math.round(displayH * geo.ratio);
    }

    // High DPI scaling (cap at 2 for performance)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvasW = Math.round(displayW * dpr);
    const canvasH = Math.round(displayH * dpr);

    pdfCanvas.width = canvasW;
    pdfCanvas.height = canvasH;
    pdfCanvas.style.width = `${displayW}px`;
    pdfCanvas.style.height = `${displayH}px`;

    const ctx = pdfCanvas.getContext('2d');

    // Draw clean white paper sheet
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // 2. Fetch page and calculate rotation to match chosen orientation
    const page = await state.activePdfDoc.getPage(pageNum);
    const unscaled = page.getViewport({ scale: 1.0 });
    const isDocNaturallyLandscape = unscaled.width > unscaled.height;

    let rotationOffset = 0;
    if (geo.isLandscape && !isDocNaturallyLandscape) {
      rotationOffset = 90;
    } else if (!geo.isLandscape && isDocNaturallyLandscape) {
      rotationOffset = 90;
    }

    const rotatedViewport = page.getViewport({
      scale: 1.0,
      rotation: (page.rotate + rotationOffset) % 360
    });

    // 3. Fit document on paper sheet with standard 2.5% printable margin
    const marginX = Math.round(canvasW * 0.025);
    const marginY = Math.round(canvasH * 0.025);
    const availW = canvasW - (marginX * 2);
    const availH = canvasH - (marginY * 2);

    const fitScale = Math.min(availW / rotatedViewport.width, availH / rotatedViewport.height);

    const finalViewport = page.getViewport({
      scale: fitScale,
      rotation: (page.rotate + rotationOffset) % 360
    });

    // Center document on paper sheet
    const offsetX = Math.round((canvasW - finalViewport.width) / 2);
    const offsetY = Math.round((canvasH - finalViewport.height) / 2);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    const renderTask = page.render({
      canvasContext: ctx,
      viewport: finalViewport
    });

    currentRenderTask = renderTask;
    await renderTask.promise;
    currentRenderTask = null;
    ctx.restore();

    updatePagerControls();
  } catch (err) {
    if (err && err.name === 'RenderingCancelledException') {
      return;
    }
    console.error('Page render error:', err);
  } finally {
    if (!currentRenderTask) {
      previewSpinner.classList.add('hidden');
    }
  }
}

function updatePagerControls() {
  pageIndicator.textContent = `Page ${state.currentPreviewPage} / ${state.totalPreviewPages}`;
  prevPageBtn.disabled = state.currentPreviewPage <= 1;
  nextPageBtn.disabled = state.currentPreviewPage >= state.totalPreviewPages;
}

// Recalculate Live Price
async function recalculatePrice() {
  if (!state.currentFile) return;

  const colorMode = document.querySelector('input[name="colorMode"]:checked').value;
  const paperSize = paperSizeSelect.value;
  const copies = parseInt(copiesInput.value, 10) || 1;
  const duplex = document.querySelector('input[name="duplexMode"]:checked').value;

  let pagesCount = state.currentFile.pageCount;
  const rangeType = document.querySelector('input[name="rangeType"]:checked').value;
  if (rangeType === 'custom' && customRangeInput.value.trim()) {
    pagesCount = parseCustomRangeCount(customRangeInput.value, state.currentFile.pageCount);
  }

  try {
    const res = await fetch('/api/jobs/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pagesCount,
        copies,
        colorMode,
        paperSize,
        duplex
      })
    });
    const data = await res.json();
    if (data.success && data.calculation) {
      totalPriceDisplay.textContent = `₹${data.calculation.totalCost.toFixed(2)}`;
      priceBreakdownText.textContent = data.calculation.breakdown;
    }
  } catch (err) {
    console.error('Price calculation error:', err);
  }
}

function parseCustomRangeCount(rangeStr, total) {
  const pages = new Set();
  const parts = rangeStr.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [s, e] = trimmed.split('-');
      const start = parseInt(s, 10);
      const end = parseInt(e, 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let p = Math.max(1, start); p <= Math.min(total, end); p++) {
          pages.add(p);
        }
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (!isNaN(p) && p >= 1 && p <= total) pages.add(p);
    }
  }
  return pages.size > 0 ? pages.size : total;
}

// Submit Print Job
async function submitPrintJob() {
  if (!state.currentFile) {
    alert('Please upload or select a document to print.');
    resetConfirmButton();
    return;
  }

  btnConfirmPrint.disabled = true;
  btnConfirmPrint.innerHTML = `
    <div class="spinner" style="width:16px;height:16px;border-width:2px;"></div>
    <span>Sending to Printer...</span>
  `;

  const colorMode = document.querySelector('input[name="colorMode"]:checked').value;
  const paperSize = paperSizeSelect.value;
  const orientation = orientationSelect.value;
  const copies = parseInt(copiesInput.value, 10) || 1;
  const duplex = document.querySelector('input[name="duplexMode"]:checked').value;
  const rangeType = document.querySelector('input[name="rangeType"]:checked').value;
  const pageRange = rangeType === 'custom' ? customRangeInput.value.trim() : 'all';

  const customerName = customerNameInput.value.trim() || 'Guest';
  const customerPhone = customerPhoneInput.value.trim();

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: state.currentFile.id,
        originalName: state.currentFile.originalName,
        customerName,
        customerPhone,
        options: {
          colorMode,
          paperSize,
          orientation,
          copies,
          pageRange,
          duplex
        }
      })
    });

    const data = await res.json();
    if (data.success && data.job) {
      state.currentJob = data.job;
      showStatusSection(data.job);
      // Re-enable and reset button immediately so subsequent prints are never locked
      resetConfirmButton();
    } else {
      throw new Error(data.error || 'Failed to submit job');
    }
  } catch (err) {
    alert(`Print submission failed: ${err.message}`);
    resetConfirmButton();
  }
}

// Display Live Status Tracking
function showStatusSection(job) {
  configSection.classList.add('hidden');
  statusSection.classList.remove('hidden');

  pickupTokenValue.textContent = job.pickupToken;
  statusPrinterName.textContent = job.printerName || 'Canon MF3010';
  statusDocName.textContent = job.originalName;
  statusCopiesPages.textContent = `${job.options.copies} copy(ies) • ${job.printedPages} page(s)`;
  statusTotalAmount.textContent = `₹${(job.totalCost || 0).toFixed(2)}`;

  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateJobProgress(job);
}

// Update Animated Stepper & Live Ticker
function updateJobProgress(job) {
  const steps = {
    stepUpload: document.getElementById('stepUpload'),
    stepProcess: document.getElementById('stepProcess'),
    stepSpool: document.getElementById('stepSpool'),
    stepPrint: document.getElementById('stepPrint'),
    stepDone: document.getElementById('stepDone')
  };
  const lines = {
    line1: document.getElementById('line1'),
    line2: document.getElementById('line2'),
    line3: document.getElementById('line3'),
    line4: document.getElementById('line4')
  };

  Object.values(steps).forEach(s => s.className = 'timeline-step');
  Object.values(lines).forEach(l => l.className = 'timeline-line');

  steps.stepUpload.className = 'timeline-step completed';
  lines.line1.className = 'timeline-line active';

  if (job.status === 'queued') {
    steps.stepProcess.className = 'timeline-step active';
    liveStatusTickerText.textContent = 'Order queued. Waiting for print spooler...';
    statusPulseIcon.textContent = '⏳';
  } else if (job.status === 'processing') {
    steps.stepProcess.className = 'timeline-step completed';
    steps.stepSpool.className = 'timeline-step active';
    lines.line2.className = 'timeline-line active';
    liveStatusTickerText.textContent = 'Formatting document for printer...';
    statusPulseIcon.textContent = '⚙️';
  } else if (job.status === 'spooling') {
    steps.stepProcess.className = 'timeline-step completed';
    steps.stepSpool.className = 'timeline-step completed';
    steps.stepPrint.className = 'timeline-step active';
    lines.line2.className = 'timeline-line active';
    lines.line3.className = 'timeline-line active';
    liveStatusTickerText.textContent = `Sending to ${job.printerName || 'Canon MF3010'}...`;
    statusPulseIcon.textContent = '🖨️';
  } else if (job.status === 'printing') {
    steps.stepProcess.className = 'timeline-step completed';
    steps.stepSpool.className = 'timeline-step completed';
    steps.stepPrint.className = 'timeline-step active';
    lines.line2.className = 'timeline-line active';
    lines.line3.className = 'timeline-line active';
    liveStatusTickerText.textContent = `Printing on ${job.printerName || 'Canon MF3010'}! Almost done...`;
    statusPulseIcon.textContent = '📄';
  } else if (job.status === 'completed') {
    steps.stepProcess.className = 'timeline-step completed';
    steps.stepSpool.className = 'timeline-step completed';
    steps.stepPrint.className = 'timeline-step completed';
    steps.stepDone.className = 'timeline-step completed';
    lines.line2.className = 'timeline-line active';
    lines.line3.className = 'timeline-line active';
    lines.line4.className = 'timeline-line active';
    liveStatusTickerText.textContent = '🎉 Done! Your print is ready at the counter!';
    statusPulseIcon.textContent = '✅';
  } else if (job.status === 'failed') {
    liveStatusTickerText.textContent = `❌ ${job.logs ? job.logs[job.logs.length - 1] : 'Printing error'}`;
    statusPulseIcon.textContent = '⚠️';
  }
}

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
