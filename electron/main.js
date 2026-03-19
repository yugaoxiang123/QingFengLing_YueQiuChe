const { app, BrowserWindow, Menu, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { startStaticServer } = require('./static-server');
const { createIOTerminalClient } = require('./io-terminal-client');
const { createIORelay, RELAY_CLOSE, RELAY_OPEN } = require('./io-relay');

let mainWindow = null;
let lastConfig = null;
let lastEntry = null;
let lastArgs = null;
let ioTerminalClient = null;
let ioRelay = null;
let ioRelayPulseTimer = null;
let ioRelayTriggerText = 'IO_RELAY:PULSE';

function isOnlineLink(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s);
}

function normalizeEntryToAbsolute(entry) {
  const cleaned = String(entry || '').replace(/^\.\//, '');
  if (!cleaned) return '';
  if (path.isAbsolute(cleaned)) return cleaned;
  return path.join(app.getAppPath(), cleaned);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function getConfigPaths() {
  const root = process.cwd();
  if (app.isPackaged) {
    return {
      prod: path.join(process.resourcesPath, 'kylin.electron.json'),
      dev: null
    };
  }
  return {
    prod: path.join(root, 'kylin.electron.json'),
    dev: path.join(root, 'kylin.dev.electron.json')
  };
}

function loadConfig() {
  const defaults = {
    window_mode: undefined,
    entry: '',
    local_server_root: '',
    local_server_port: 0,
    chromium_args: {},
    io_terminal: {
      enabled: false,
      host: '192.168.1.95',
      port: 8234,
      poll_interval_ms: 50,
      connect_timeout_ms: 1500,
      inject_mode: 'sendInputEvent'
    },
    io_relay: {
      enabled: false,
      host: '192.168.1.95',
      port: 8234,
      connect_timeout_ms: 1500,
      pulse_ms: 10000,
      trigger_text: 'IO_RELAY:PULSE'
    },
    window: {
      width: 1280,
      height: 720,
      show: true,
      autoHideMenuBar: true,
      backgroundColor: '#000000',
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    },
    auto_update_url: '',
    auto_update_time: 0,
    auto_update_auto_restart: false
  };

  const { prod, dev } = getConfigPaths();
  const prodConfig = readJson(prod) || {};
  const devConfig = dev ? readJson(dev) || {} : {};

  return {
    ...defaults,
    ...prodConfig,
    ...devConfig,
    window: {
      ...defaults.window,
      ...(prodConfig.window || {}),
      ...(devConfig.window || {}),
      webPreferences: {
        ...(defaults.window.webPreferences || {}),
        ...((prodConfig.window && prodConfig.window.webPreferences) || {}),
        ...((devConfig.window && devConfig.window.webPreferences) || {})
      }
    }
  };
}

function applyWindowMode(win, mode) {
  if (mode === 'kiosk') {
    win.setKiosk(true);
    win.setResizable(false);
    return;
  }
  if (mode === 'full') {
    win.setFullScreen(true);
    win.setResizable(false);
    return;
  }
  if (mode === 'max') {
    win.maximize();
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--unity') out.unity = true;
    else if (a === '--entry') out.entry = argv[++i];
    else if (a === '--window_mode') out.window_mode = argv[++i];
    else if (a === '--local_server_root') out.local_server_root = argv[++i];
    else if (a === '--local_server_port') out.local_server_port = Number(argv[++i]);
    else if (a === '--ignore-gpu-blocklist') out.ignore_gpu_blocklist = true;
    else if (a === '--smoke_exit_ms') out.smoke_exit_ms = Number(argv[++i]);
    else if (a === '--io_terminal') out.io_terminal = true;
    else if (a === '--io_host') out.io_host = argv[++i];
    else if (a === '--io_port') out.io_port = Number(argv[++i]);
    else if (a === '--io_poll_ms') out.io_poll_ms = Number(argv[++i]);
    else if (a === '--io_connect_timeout_ms') out.io_connect_timeout_ms = Number(argv[++i]);
    else if (a === '--io_inject_mode') out.io_inject_mode = argv[++i];
  }
  return out;
}

function resolvePath(p) {
  const cleaned = String(p || '').replace(/^\.\//, '');
  if (!cleaned) return '';
  if (path.isAbsolute(cleaned)) return cleaned;
  if (!app.isPackaged) return path.join(process.cwd(), cleaned);
  const inResources = path.join(process.resourcesPath, cleaned);
  if (fs.existsSync(inResources)) return inResources;
  return path.join(app.getAppPath(), cleaned);
}

function applyChromiumArgs(chromiumArgs) {
  const args = chromiumArgs && typeof chromiumArgs === 'object' ? chromiumArgs : {};
  for (const rawKey of Object.keys(args)) {
    const key = String(rawKey).replace(/^--/, '');
    const value = args[rawKey];
    if (value === false || value === null || typeof value === 'undefined') continue;
    if (value === true) app.commandLine.appendSwitch(key);
    else app.commandLine.appendSwitch(key, String(value));
  }
}

async function resolveEntry(config) {
  if (isOnlineLink(config.entry)) return config.entry;
  const filePath = resolvePath(config.entry);
  if (!filePath) throw new Error('未配置 entry');

  const serverRoot = resolvePath(config.local_server_root);
  if (serverRoot) {
    const { port } = await startStaticServer({
      root: serverRoot,
      port: Number(config.local_server_port || 0) || 0
    });
    const rel = path.relative(serverRoot, filePath);
    const urlPath = rel.startsWith('..') ? 'index.html' : rel.replace(/\\/g, '/');
    const url = `http://127.0.0.1:${port}/${urlPath}`;
    return url;
  }

  return filePath;
}

function logAutoUpdateOverlay(message) {
  return;
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  const text = '[update] ' + new Date().toISOString().slice(11, 19) + ' ' + String(message || '');
  const js = '(function(){try{' +
    'if(!document||!document.body){return;}' +
    'var msg=' + JSON.stringify(text) + ';' +
    "var id='__auto_update_overlay__';" +
    'var root=document.getElementById(id);' +
    "if(!root){" +
      "root=document.createElement('div');" +
      "root.id=id;" +
      "root.style.position='fixed';" +
      "root.style.top='8px';" +
      "root.style.left='8px';" +
      "root.style.zIndex='2147483647';" +
      "root.style.fontSize='12px';" +
      "root.style.color='#0f0';" +
      "root.style.background='rgba(0,0,0,0.6)';" +
      "root.style.padding='4px 8px';" +
      "root.style.maxWidth='60%';" +
      "root.style.pointerEvents='none';" +
      "root.style.whiteSpace='pre-wrap';" +
      "document.body.appendChild(root);" +
    "}" +
    "var line=document.createElement('div');" +
    'line.textContent=msg;' +
    'root.insertBefore(line, root.firstChild);' +
    'var max=8;' +
    'while(root.childNodes.length>max){root.removeChild(root.lastChild);}' +
  '}catch(e){}})();';
  try {
    win.webContents.executeJavaScript(js, true);
  } catch {}
}

function setupAutoUpdate(config) {
  if (!app.isPackaged) return;
  if (!config.auto_update_url) return;

  autoUpdater.requestHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', (e) => {
    console.error('[autoUpdater] error', e);
  });

  autoUpdater.on('update-available', (info) => {
    // no UI/log overlay
  });

  autoUpdater.on('update-not-available', () => {
    // no UI/log overlay
  });

  autoUpdater.on('download-progress', (p) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const percent = Math.max(0, Math.min(100, Math.floor(Number(p.percent || 0))));
    win.setProgressBar(percent / 100);
  });

  autoUpdater.on('update-downloaded', async () => {
    autoUpdater.quitAndInstall(true, true);
  });

  autoUpdater.setFeedURL(config.auto_update_url);
  autoUpdater.checkForUpdates();

  const intervalMs = Number(config.auto_update_time || 60000);
  if (intervalMs > 0) {
    setInterval(() => autoUpdater.checkForUpdates(), intervalMs);
  }
}

function createMainWindow(config, entry, args) {
  const winOpts = { ...config.window };
  if (config.window_mode === 'kiosk') {
    winOpts.kiosk = true;
    winOpts.resizable = false;
  } else if (config.window_mode === 'full') {
    winOpts.fullscreen = true;
    winOpts.resizable = false;
  }

  const win = new BrowserWindow(winOpts);
  Menu.setApplicationMenu(null);

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.webContents.on('console-message', (_event, _level, message) => {
    tryHandleRelayTriggerFromConsole(String(message || ''));
  });
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[web] did-fail-load', errorCode, errorDescription, validatedURL);
  });

  if (isOnlineLink(entry)) {
    win.loadURL(entry);
  } else {
    win.loadFile(entry);
  }

  win.once('ready-to-show', () => {
    applyWindowMode(win, config.window_mode);
    if (!app.isPackaged && args && Number(args.smoke_exit_ms) > 0) {
      setTimeout(() => {
        try {
          win.close();
        } catch {}
        try {
          app.quit();
        } catch {}
      }, Number(args.smoke_exit_ms));
    }
  });

  mainWindow = win;
  return win;
}

function logToDevtools(_data) {
  // no-op: remove verbose logging
}

function logRelay(_event, _extra) {
  // no-op: remove verbose logging
}

function setupIORelay(config) {
  const conf = config && typeof config === 'object' ? config.io_relay : null;
  if (!conf || conf.enabled !== true) {
    return;
  }
  ioRelayTriggerText = String(conf.trigger_text || 'IO_RELAY:PULSE');

  if (ioRelay) {
    try {
      ioRelay.stop();
    } catch {}
    ioRelay = null;
  }

  if (ioTerminalClient && typeof ioTerminalClient.send === 'function') {
    ioRelay = {
      start: () => {},
      stop: () => {},
      send: (frame) => ioTerminalClient.send(frame),
      frames: { RELAY_CLOSE, RELAY_OPEN }
    };
  } else {
    ioRelay = createIORelay({
      host: String(conf.host || '192.168.1.95'),
      port: Number(conf.port || 8234),
      connectTimeoutMs: Number(conf.connect_timeout_ms || 1500),
      onStatus: () => {},
      onTx: () => {}
    });
    ioRelay.start();
    app.once('before-quit', () => {
      try {
        ioRelay && ioRelay.stop();
      } catch {}
    });
  }
}

function pulseRelay(pulseMs) {
  if (!ioRelay) return;
  const ms = Math.max(50, Number(pulseMs || 10000));
  const ok = ioRelay.send(RELAY_CLOSE);

  if (ioRelayPulseTimer) {
    clearTimeout(ioRelayPulseTimer);
    ioRelayPulseTimer = null;
  }
  ioRelayPulseTimer = setTimeout(() => {
    ioRelayPulseTimer = null;
    const ok2 = ioRelay.send(RELAY_OPEN);
  }, ms);
}

function tryHandleRelayTriggerFromConsole(message) {
  if (!ioRelay || !ioRelayTriggerText) return;
  const m = String(message || '').trim();
  if (m !== ioRelayTriggerText) return;
  const cfg = lastConfig && lastConfig.io_relay ? lastConfig.io_relay : null;
  const pulseMs = cfg ? cfg.pulse_ms : 10000;
  pulseRelay(pulseMs);
}

async function main() {
  try {
    app.commandLine.appendSwitch('disable-http2');
    app.commandLine.appendSwitch('--disable-http-cache');
    app.commandLine.appendSwitch('--disable-gpu-process-crash-limit');
    app.disableDomainBlockingFor3DAPIs();

    if (!app.isPackaged) {
      app.setPath('userData', path.join(process.cwd(), '.userData'));
    }

    const args = parseArgs(process.argv.slice(2));
    const config = loadConfig();
    if (args.unity) {
      config.entry = './WebGLBuild/index.html';
      config.local_server_root = './WebGLBuild';
      config.local_server_port = 17888;
      config.window_mode = 'kiosk';
    }

    if (typeof args.entry === 'string') config.entry = args.entry;
    if (typeof args.window_mode === 'string') config.window_mode = args.window_mode;
    if (typeof args.local_server_root === 'string') config.local_server_root = args.local_server_root;
    if (Number.isFinite(args.local_server_port)) config.local_server_port = args.local_server_port;

    config.io_terminal = config.io_terminal && typeof config.io_terminal === 'object' ? config.io_terminal : {};
    if (args.io_terminal) config.io_terminal.enabled = true;
    if (typeof args.io_host === 'string') config.io_terminal.host = args.io_host;
    if (Number.isFinite(args.io_port)) config.io_terminal.port = args.io_port;
    if (Number.isFinite(args.io_poll_ms)) config.io_terminal.poll_interval_ms = args.io_poll_ms;
    if (Number.isFinite(args.io_connect_timeout_ms)) {
      config.io_terminal.connect_timeout_ms = args.io_connect_timeout_ms;
    }
    if (typeof args.io_inject_mode === 'string') config.io_terminal.inject_mode = args.io_inject_mode;

    config.chromium_args = config.chromium_args && typeof config.chromium_args === 'object' ? config.chromium_args : {};
    if ((args.unity || String(config.entry || '').includes('WebGLBuild')) && !config.chromium_args['use-angle']) {
      config.chromium_args['use-angle'] = 'gl';
    }

    if (args.ignore_gpu_blocklist) {
      app.commandLine.appendSwitch('ignore-gpu-blocklist');
    }

    applyChromiumArgs(config.chromium_args);
    if (!app.isPackaged) {
      // no verbose logging
    }

    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      app.exit(0);
      return;
    }

    app.on('second-instance', () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    });

    await app.whenReady();

    const entry = await resolveEntry(config);
    lastConfig = config;
    lastEntry = entry;
    lastArgs = args;
    createMainWindow(config, entry, args);
    setupAutoUpdate(config);
    setupIOTerminal(config);
    setupIORelay(config);
    setupDevToolsShortcut();

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        if (lastConfig && lastEntry) {
          createMainWindow(lastConfig, lastEntry, lastArgs);
        }
      }
    });
  } catch (e) {
    console.error(e);
    try {
      dialog.showErrorBox('温馨提示', e && e.message ? e.message : String(e));
    } catch {}
    if (app.isReady()) app.quit();
    else app.exit(1);
  }
}

function setupDevToolsShortcut() {
  try {
    globalShortcut.unregister('CommandOrControl+F12');
  } catch {}
  try {
    globalShortcut.register('CommandOrControl+F12', () => {
      const win = BrowserWindow.getFocusedWindow() || mainWindow || BrowserWindow.getAllWindows()[0];
      if (!win || win.isDestroyed()) return;
      try {
        if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
        else win.webContents.openDevTools({ mode: 'detach' });
      } catch {}
    });
  } catch {}
  app.once('will-quit', () => {
    try {
      globalShortcut.unregister('CommandOrControl+F12');
    } catch {}
  });
}

function setupIOTerminal(config) {
  const conf = config && typeof config === 'object' ? config.io_terminal : null;
  if (!conf) return;
  if (conf.enabled !== true) {
    return;
  }

  const keyCodes = ['W', 'S', 'A', 'D', 'Q', 'E'];
  const domKeys = ['w', 's', 'a', 'd', 'q', 'e'];
  const keyLabels = ['W', 'S', 'A', 'D', 'Q', 'E'];

  function getWin() {
    if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
    const all = BrowserWindow.getAllWindows();
    return all && all[0] ? all[0] : null;
  }

  function logToDevtools(_data) {
    // no-op: prevent long-running console injection/log growth
  }

  function logIO(_event, _extra) {
    // no-op: keep hardware input behavior, remove verbose logging
  }

  function injectKey(i, down) {
    const win = getWin();
    if (!win || win.isDestroyed()) return;
    const wc = win.webContents;
    try {
      wc.focus();
    } catch {}

    if (conf.inject_mode === 'domEvent') {
      const key = domKeys[i] || '';
      const type = down ? 'keydown' : 'keyup';
      const js = `(function(){try{const e=new KeyboardEvent(${JSON.stringify(type)},{key:${JSON.stringify(
        key
      )},bubbles:true});window.dispatchEvent(e);document.dispatchEvent(e);}catch{}})();`;
      try {
        wc.executeJavaScript(js, true);
      } catch (e) {
        // ignore injection errors
      }
      return;
    }

    const keyCode = keyCodes[i];
    if (!keyCode) {
      return;
    }
    try {
      wc.sendInputEvent({ type: down ? 'keyDown' : 'keyUp', keyCode });
    } catch (e) {
      // ignore injection errors
    }
  }

  if (ioTerminalClient) {
    try {
      ioTerminalClient.stop();
    } catch {}
    ioTerminalClient = null;
  }

  ioTerminalClient = createIOTerminalClient({
    host: String(conf.host || '192.168.1.95'),
    port: Number(conf.port || 8234),
    pollIntervalMs: Number(conf.poll_interval_ms || 50),
    connectTimeoutMs: Number(conf.connect_timeout_ms || 1500),
    onStatus: () => {},
    onInputs: (inputs, prev) => {
      for (let i = 0; i < 6; i++) {
        const curr = Boolean(inputs[i]);
        const before = prev ? Boolean(prev[i]) : false;
        if (curr === before) continue;
        injectKey(i, curr);
      }
    }
  });

  ioTerminalClient.start();
  app.once('before-quit', () => {
    try {
      ioTerminalClient && ioTerminalClient.stop();
    } catch {}
  });
}

main();
