const net = require('net');

const REQUEST_READ_INPUTS = Buffer.from('0104000000067008', 'hex');
const RESPONSE_PREFIX = Buffer.from([0x01, 0x04, 0x0c]);
const RESPONSE_LEN = 3 + 12 + 2;

function crc16Modbus(buf) {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      const lsb = crc & 1;
      crc >>= 1;
      if (lsb) crc ^= 0xa001;
    }
  }
  return crc & 0xffff;
}

function findResponseStart(buffer) {
  for (let i = 0; i <= buffer.length - RESPONSE_PREFIX.length; i++) {
    if (
      buffer[i] === RESPONSE_PREFIX[0] &&
      buffer[i + 1] === RESPONSE_PREFIX[1] &&
      buffer[i + 2] === RESPONSE_PREFIX[2]
    ) {
      return i;
    }
  }
  return -1;
}

function parseResponseFrame(frame) {
  if (!Buffer.isBuffer(frame) || frame.length !== RESPONSE_LEN) return null;
  if (frame[0] !== 0x01 || frame[1] !== 0x04 || frame[2] !== 0x0c) return null;

  const withoutCrc = frame.slice(0, frame.length - 2);
  const crc = crc16Modbus(withoutCrc);
  const crcLo = frame[frame.length - 2];
  const crcHi = frame[frame.length - 1];
  const crcFromWire = (crcHi << 8) | crcLo;
  if (crc !== crcFromWire) return null;

  const out = [];
  let offset = 3;
  for (let i = 0; i < 6; i++) {
    const v = frame.readUInt16BE(offset);
    out.push(v !== 0);
    offset += 2;
  }
  return out;
}

function createIOTerminalClient(options) {
  const host = (options && options.host) || '192.168.1.95';
  const port = Number((options && options.port) || 8234);
  const pollIntervalMs = Math.max(50, Number((options && options.pollIntervalMs) || 50));
  const connectTimeoutMs = Math.max(200, Number((options && options.connectTimeoutMs) || 1500));

  const onInputs = typeof options?.onInputs === 'function' ? options.onInputs : () => {};
  const onStatus = typeof options?.onStatus === 'function' ? options.onStatus : () => {};

  let socket = null;
  let pollTimer = null;
  let reconnectTimer = null;
  let rxBuffer = Buffer.alloc(0);
  let stopped = false;
  let backoffMs = 300;
  let lastInputs = null;

  function clearTimers() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function stopSocket() {
    if (!socket) return;
    try {
      socket.removeAllListeners();
    } catch {}
    try {
      socket.destroy();
    } catch {}
    socket = null;
  }

  function handleInputs(inputs) {
    if (!Array.isArray(inputs) || inputs.length !== 6) return;
    if (!lastInputs) {
      lastInputs = inputs.slice();
      onInputs(inputs, null);
      return;
    }
    let changed = false;
    for (let i = 0; i < 6; i++) {
      if (Boolean(inputs[i]) !== Boolean(lastInputs[i])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    const prev = lastInputs;
    lastInputs = inputs.slice();
    onInputs(inputs, prev);
  }

  function processRx() {
    while (rxBuffer.length >= RESPONSE_LEN) {
      const start = findResponseStart(rxBuffer);
      if (start < 0) {
        rxBuffer = rxBuffer.slice(Math.max(0, rxBuffer.length - (RESPONSE_LEN - 1)));
        return;
      }
      if (start > 0) rxBuffer = rxBuffer.slice(start);
      if (rxBuffer.length < RESPONSE_LEN) return;
      const frame = rxBuffer.slice(0, RESPONSE_LEN);
      rxBuffer = rxBuffer.slice(RESPONSE_LEN);
      const inputs = parseResponseFrame(frame);
      if (inputs) handleInputs(inputs);
    }
  }

  function scheduleReconnect(reason) {
    if (stopped) return;
    clearTimers();
    stopSocket();
    onStatus({ state: 'disconnected', reason, host, port });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoffMs);
    backoffMs = Math.min(5000, Math.floor(backoffMs * 1.5));
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (stopped) return;
      if (!socket || socket.destroyed) return;
      if (!socket.writable) return;
      try {
        socket.write(REQUEST_READ_INPUTS);
      } catch {}
    }, pollIntervalMs);
    try {
      socket.write(REQUEST_READ_INPUTS);
    } catch {}
  }

  function connect() {
    if (stopped) return;
    clearTimers();
    stopSocket();
    rxBuffer = Buffer.alloc(0);

    onStatus({ state: 'connecting', host, port });
    const s = net.createConnection({ host, port });
    socket = s;
    try {
      s.setNoDelay(true);
      s.setKeepAlive(true);
      s.setTimeout(connectTimeoutMs);
    } catch {}

    s.once('connect', () => {
      backoffMs = 300;
      try {
        s.setTimeout(0);
      } catch {}
      onStatus({ state: 'connected', host, port });
      startPolling();
    });

    s.on('data', (chunk) => {
      if (!chunk || !chunk.length) return;
      rxBuffer = Buffer.concat([rxBuffer, chunk]);
      processRx();
    });

    s.once('timeout', () => {
      scheduleReconnect('timeout');
    });

    s.once('error', (e) => {
      scheduleReconnect(e && e.message ? e.message : 'error');
    });

    s.once('close', () => {
      scheduleReconnect('close');
    });
  }

  function send(frame) {
    if (stopped) return false;
    if (!socket || socket.destroyed) return false;
    if (!socket.writable) return false;
    if (!Buffer.isBuffer(frame)) return false;
    try {
      socket.write(frame);
      return true;
    } catch {
      return false;
    }
  }

  function start() {
    stopped = false;
    connect();
  }

  function stop() {
    stopped = true;
    clearTimers();
    stopSocket();
  }

  return { start, stop, send };
}

module.exports = {
  createIOTerminalClient,
  crc16Modbus
};
