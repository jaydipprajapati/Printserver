# 🖨️ QR Code Based Online Printing Service System

A complete, production-grade online printing service website and automated Windows print agent. Customers scan a QR code on their smartphone or browser, upload any document (**PDF, Word, Excel, Photos, Text**), configure print options (**Paper size, B&W / Color, Copies, Page Range, Orientation, Duplex**), and tap **"Confirm & Print"** to trigger **instant, silent physical printing** on any connected Windows printer (USB like **Canon MF3010** or Wi-Fi/Network).

---

## 🌟 Key Features

### 1. 📱 Customer Web & Mobile Portal
- **Zero App Installation**: Scans counter QR code with standard smartphone camera.
- **Universal Document Support**: PDF, Word (`.docx`, `.doc`), Excel (`.xlsx`, `.xls`), Photos (`JPG`, `PNG`, `WEBP`), and plain text.
- **Interactive Live Preview**: High-DPI canvas preview using embedded PDF.js engine with page stepper.
- **Full Print Configurator**:
  - Color Mode: Crisp Black & White vs Full Color.
  - Paper Size: A4 (Standard), A3 (Large), Letter, Legal.
  - Copies: Stepper controls with quick chips (1, 2, 5, 10).
  - Page Range: "All Pages" or custom ranges (e.g., `1-3, 5, 8`).
  - Orientation: Portrait, Landscape, or Auto.
  - Duplex: Single-Sided or Double-Sided (with automatic discount).
- **Live Dynamic Cost Estimator**: Instant real-time calculation based on selected page range and paper specs.
- **Real-Time Job Tracker**: Animated timeline showing `Uploaded` ➔ `Converted` ➔ `Spooling` ➔ `Printing` ➔ `Done`, with unique Pickup Token (e.g. `#PR-8921`).

### 2. ⚡ Node.js Backend Server
- **REST & Real-Time WebSockets**: Live bidirectional event bus for instant job dispatch and progress updates.
- **Format Normalizer & Converter**:
  - Image to A4 PDF auto-scaler with margins (`pdf-lib`).
  - Word & Excel to PDF conversion via Windows COM automation.
  - PDF page slicer to extract requested page ranges before spooling.
- **Security & Privacy**: Auto-purging retention service that deletes customer documents after 120 minutes (configurable).
- **Authenticated Agent Channel**: Secure token-protected WebSocket connection for remote or local Windows Print Agents.

### 3. 🖨️ Windows Print Agent Service
- **Silent Hardware Printing**: Uses bundled SumatraPDF engine and Windows Print Spooler (`pdf-to-printer`) for zero-dialog direct printing.
- **Hardware Auto-Discovery**: Automatically enumerates all local and network Windows printers (USB port `USB001` like Canon MF3010, Wi-Fi, etc.).
- **Spooler Tracking**: Detects when pages are spooled and reports real-time progress back to the customer's phone.
- **Auto-Reconnect**: Resilient connection with automatic backoff.

### 4. 📊 Admin Management Dashboard
- **Live Print Queue Monitor**: View pending, active, and completed orders with 1-click **Print**, **Reprint**, and **Done** actions.
- **Auto-Print Switch**: Toggle between 100% automated direct printing vs manual verification before paper feed.
- **Hardware Health**: Monitor detected printers, default printer selection, and agent connectivity.
- **Tariff & Pricing Control**: Customize B&W and Color rates per page, duplex discount percentage, and shop information.
- **Printable A4 QR Standee Generator**: 1-click generation of high-contrast counter posters with customizable shop name and QR code.

---

## 🚀 Quick Start (1-Click Launch)

### Option A: Complete System Launch (Recommended)
Double-click:
```bash
scripts/start-all.bat
```
This automatically starts the backend server, launches the Windows Print Agent, and opens the Admin Dashboard in your default browser.

### Option B: Manual Launch
1. **Start the Backend Server**:
   ```bash
   node server/index.js
   ```
2. **Start the Windows Print Agent** (in a separate terminal):
   ```bash
   node agent/printAgent.js
   ```

---

## 🌐 URLs & Access Points

| Portal | URL | Description |
|---|---|---|
| **Customer Web App** | `http://localhost:4000/` | Customer upload and print interface |
| **Mobile Access (Wi-Fi)** | `http://<YOUR-LOCAL-IP>:4000/` | Scan QR code from phone connected to same Wi-Fi |
| **Admin Dashboard** | `http://localhost:4000/admin` | Live queue, printer controls, pricing settings |
| **Printable Standee** | `http://localhost:4000/standee` | Ready-to-print A4 counter flyer |

---

## 🔧 Hardware Verification Test

To verify physical communication with your **Canon MF3010** (or any installed printer) right away:
```bash
node agent/testPrint.js "Canon MF3010"
```
Or click **"Print Hardware Test Page"** in the **Admin Dashboard ➔ Printers** tab.

---

## 📁 Project Structure

```
d:/JAYDIP/AI Projects/PRINT SERVER/
├── agent/
│   ├── printAgent.js          # Windows Print Agent daemon
│   ├── printerService.js      # Windows printer query & silent printing engine
│   └── testPrint.js           # Hardware diagnostic test tool
├── server/
│   ├── index.js               # Express & WebSocket server
│   ├── config.js              # Ports, IP detection, pricing defaults, tokens
│   ├── storage.js             # Data persistence (jobs, settings, stats)
│   ├── services/
│   │   ├── converter.js       # PDF, Image, Word & Excel document normalizer
│   │   ├── pricing.js         # Tariff & cost calculator
│   │   ├── qr.js              # QR code generator (PNG / SVG)
│   │   └── cleanup.js         # Document retention auto-cleaner
│   └── routes/
│       ├── upload.js          # Multi-format file uploader & preview stream
│       ├── jobs.js            # Job creation, live price API, cancellation
│       └── admin.js           # Admin APIs, printer list, pricing, reports
├── public/
│   ├── index.html             # Customer mobile/web portal
│   ├── styles.css             # Vibrant glassmorphic theme (Dark/Light)
│   ├── app.js                 # Customer frontend logic & PDF.js preview
│   ├── admin.html             # Admin Management Dashboard
│   ├── admin.css              # Dashboard styles & metric cards
│   ├── admin.js               # Admin live queue & printer control logic
│   └── standee.html           # Printable A4 Shop Counter Standee
├── scripts/
│   ├── start-server.bat       # 1-click server start
│   ├── start-agent.bat        # 1-click agent start
│   └── start-all.bat          # 1-click master launcher
├── uploads/                   # Stored uploaded files (auto-purged)
├── converted/                 # Converted print-ready PDFs
└── data/                      # Persistent settings, jobs & statistics
```

---

## 🔒 Security & Privacy Guidelines
1. **Document Auto-Purge**: All uploaded documents and converted print-ready PDFs are automatically deleted after the configured retention period (`retentionMinutes`, default 120 minutes) by `cleanupService`.
2. **Agent Authentication**: The Windows Print Agent connects using `AGENT_AUTH_TOKEN` (`PRINT_AGENT_SECRET_SECURE_2026` in `config.js` or `.env`) ensuring only authorized agent daemons can receive print jobs.
3. **LAN/Wi-Fi Firewalls**: For customers on the shop Wi-Fi to reach the server, ensure Windows Firewall allows inbound connections on TCP port `4000`.
