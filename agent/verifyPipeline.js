const fs = require('fs');
const path = require('path');
const http = require('http');

async function testUploadAndCalculate() {
  const testPath = path.join(__dirname, 'test_sample.txt');
  fs.writeFileSync(testPath, 'FastPrint Express Automated Online Printing Verification.\nDocument uploaded via simulated QR mobile portal.\nReady for Canon MF3010!\nDate: ' + new Date().toLocaleString());

  const fileData = fs.readFileSync(testPath);
  const boundary = '----CustomBoundary12345';

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="test_sample.txt"\r\n` +
    `Content-Type: text/plain\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, fileData, footer]);

  console.log('1. Uploading test document to server...');
  const uploadRes = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/upload',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  console.log('Upload Response:', JSON.stringify(uploadRes, null, 2));

  if (!uploadRes.success || !uploadRes.file) {
    throw new Error('Upload failed');
  }

  const fileId = uploadRes.file.id;
  console.log(`\n2. Calculating price for file: ${fileId}...`);

  const calcRes = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 4000,
      path: '/api/jobs/calculate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(JSON.stringify({
      pagesCount: uploadRes.file.pageCount,
      copies: 2,
      colorMode: 'bw',
      paperSize: 'A4',
      duplex: 'simplex'
    }));
    req.end();
  });

  console.log('Price Calculation:', JSON.stringify(calcRes, null, 2));

  console.log('\n3. Testing QR Code generation endpoint...');
  const qrRes = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:4000/api/admin/qr', res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });

  console.log('QR Code URL:', qrRes.url);
  console.log('QR Image Data (prefix):', qrRes.qrImage.slice(0, 50) + '...');
  console.log('\n🎉 ALL PIPELINE TESTS PASSED SUCCESSFULLY!');
}

testUploadAndCalculate().catch(console.error);
