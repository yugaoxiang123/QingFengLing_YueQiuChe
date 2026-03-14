const net = require('net');
const { crc16Modbus } = require('../electron/io-terminal-client');

const PORT = Number(process.env.IO_PORT || 8234);
const HOST = process.env.IO_HOST || '0.0.0.0';

const inputs = [false, false, false, false, false, false];
let step = 0;

function buildResponseFrame() {
  const payload = Buffer.alloc(3 + 12);
  payload[0] = 0x01;
  payload[1] = 0x04;
  payload[2] = 0x0c;
  for (let i = 0; i < 6; i++) {
    payload.writeUInt16BE(inputs[i] ? 1 : 0, 3 + i * 2);
  }
  const crc = crc16Modbus(payload);
  const crcBuf = Buffer.from([crc & 0xff, (crc >> 8) & 0xff]);
  return Buffer.concat([payload, crcBuf]);
}

function tickInputs() {
  for (let i = 0; i < 6; i++) inputs[i] = false;
  const idx = step % 6;
  inputs[idx] = true;
  step++;
}

setInterval(tickInputs, 800);

const server = net.createServer((socket) => {
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    try {
      const hex = Buffer.from(chunk || []).toString('hex');
      if (hex.startsWith('0105')) {
        console.log('[mock-io] rx', hex);
      }
    } catch {}
    try {
      socket.write(buildResponseFrame());
    } catch {}
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[mock-io] listening on ${HOST}:${PORT}`);
});
