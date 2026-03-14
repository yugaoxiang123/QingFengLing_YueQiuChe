const net = require('net');

const RELAY_CLOSE = Buffer.from('01050000ff008c3a', 'hex');
const RELAY_OPEN = Buffer.from('010500000000cdca', 'hex');

function createIORelay(options) {
  const host = String((options && options.host) || '192.168.1.95');
  const port = Number((options && options.port) || 8234);
  const connectTimeoutMs = Math.max(200, Number((options && options.connectTimeoutMs) || 1500));

  const onStatus = typeof options?.onStatus === 'function' ? options.onStatus : () => {};
  const onTx = typeof options?.onTx === 'function' ? options.onTx : () => {};

  let socket = null;
  let stopped = false;
  let reconnectTimer = null;
  let backoffMs = 300;

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

  function clearReconnect() {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function scheduleReconnect(reason) {
    if (stopped) return;
    clearReconnect();
    stopSocket();
    onStatus({ state: 'disconnected', reason, host, port });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoffMs);
    backoffMs = Math.min(5000, Math.floor(backoffMs * 1.5));
  }

  function connect() {
    if (stopped) return;
    clearReconnect();
    stopSocket();
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
    });

    s.once('timeout', () => scheduleReconnect('timeout'));
    s.once('error', (e) => scheduleReconnect(e && e.message ? e.message : 'error'));
    s.once('close', () => scheduleReconnect('close'));
  }

  function start() {
    stopped = false;
    connect();
  }

  function stop() {
    stopped = true;
    clearReconnect();
    stopSocket();
  }

  function send(frame) {
    if (stopped) return false;
    if (!socket || socket.destroyed) return false;
    if (!socket.writable) return false;
    if (!Buffer.isBuffer(frame)) return false;
    try {
      socket.write(frame);
      onTx({ bytes: frame.toString('hex') });
      return true;
    } catch {
      return false;
    }
  }

  return {
    start,
    stop,
    send,
    frames: { RELAY_CLOSE, RELAY_OPEN }
  };
}

module.exports = { createIORelay, RELAY_CLOSE, RELAY_OPEN };

