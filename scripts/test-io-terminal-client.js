const { createIOTerminalClient } = require('../electron/io-terminal-client');

const host = process.env.IO_HOST || '127.0.0.1';
const port = Number(process.env.IO_PORT || 8234);

const client = createIOTerminalClient({
  host,
  port,
  pollIntervalMs: 200,
  onStatus: (s) => console.log('[io]', s),
  onInputs: (inputs, prev) => console.log('[io] inputs=', inputs, 'prev=', prev)
});

client.start();

setTimeout(() => {
  client.stop();
  process.exit(0);
}, 6000);

