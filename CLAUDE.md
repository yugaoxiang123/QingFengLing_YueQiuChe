# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

月壤车 (qfcar) is an Electron desktop application that loads Unity WebGL builds or a React renderer. The main process manages windows, auto-updates, and hardware I/O integration with external terminal devices.

## Architecture

### Three-Part Structure

1. **Electron Main Process** ([electron/main.js](electron/main.js))
   - Window management with configurable modes (kiosk, max, normal)
   - Built-in static server for Unity WebGL (avoids CORS/WASM issues with file://)
   - Auto-updater integration (electron-updater)
   - I/O terminal client: polls 6-channel input from socket server, injects keyboard events
   - I/O relay: listens to Unity console logs, triggers relay pulses via socket

2. **Unity WebGL** ([WebGLBuild/](WebGLBuild/))
   - Default production entry point
   - Served via built-in static server on port 17888
   - Communicates with Electron via console.log messages (e.g., "IO_RELAY:PULSE")

3. **React Renderer** ([renderer/](renderer/))
   - Vite + React + TypeScript
   - Alternative entry point for development
   - Build output synced to root (index.html + assets/) for electron-builder

### Configuration System

Two JSON files control runtime behavior:

- **kylin.electron.json**: Production config (packaged into resources/)
- **kylin.dev.electron.json**: Development overrides (local only)

Dev config merges over prod config. Key fields:
- `entry`: URL or relative path to load
- `window_mode`: "kiosk" | "max" | "normal"
- `local_server_root` / `local_server_port`: Enable built-in static server
- `chromium_args`: Chromium flags (e.g., use-angle=gl for GPU compatibility)
- `io_terminal`: 6-channel input polling config
- `io_relay`: Console-triggered relay pulse config
- `auto_update_url`: Update server URL

## Development Commands

### Setup
```bash
yarn install
cd renderer && yarn install
```

### Running

- **React renderer + Electron**: `yarn dev:web`
  - Starts Vite dev server on port 3000
  - Electron loads http://localhost:3000

- **Unity WebGL + Electron**: `yarn dev:unity`
  - Electron loads WebGLBuild/index.html via built-in static server
  - Runs in kiosk mode by default

- **Electron only** (uses config entry): `yarn dev`

### Building

- **Build renderer**: `yarn build:renderer` (in renderer/ or from root)
- **Sync renderer to root**: `yarn sync:renderer`
- **Full build + package**: `yarn build`
  - Auto-increments version patch number
  - Builds renderer
  - Syncs renderer/dist to root
  - Runs electron-builder
- **Package without installer**: `yarn package:dir`

Output: `dist/` directory

## I/O Hardware Integration

### Input Terminal (6 channels)

- Socket client connects to IO module (default: 192.168.1.95:8234)
- Polls 6-channel input at 50ms intervals
- Maps channels 1-6 to keyboard keys: W, S, A, D, Q, E
- Injects keys via `sendInputEvent` (configurable to `webContents.sendInputEvent`)
- Config: `io_terminal` in kylin.*.electron.json
- Code: [electron/io-terminal-client.js](electron/io-terminal-client.js)

### Relay Output (console-triggered)

- Listens to renderer console messages via `console-message` event
- When Unity logs "IO_RELAY:PULSE", sends relay close command
- Automatically sends open command after 10s (configurable pulse_ms)
- Repeated triggers reset the timer
- Commands: close=`01 05 00 00 FF 00 8C 3A`, open=`01 05 00 00 00 00 CD CA`
- Config: `io_relay` in kylin.*.electron.json
- Code: [electron/io-relay.js](electron/io-relay.js)

Unity example:
```csharp
Debug.Log("IO_RELAY:PULSE");
```

## Key Files

- [electron/main.js](electron/main.js): Main process entry, window creation, I/O integration
- [electron/static-server.js](electron/static-server.js): Built-in HTTP server with COOP/COEP headers
- [electron/io-terminal-client.js](electron/io-terminal-client.js): 6-channel input polling
- [electron/io-relay.js](electron/io-relay.js): Console-triggered relay control
- [scripts/electron-build.js](scripts/electron-build.js): Build script with version auto-increment
- [scripts/sync-renderer-dist.js](scripts/sync-renderer-dist.js): Syncs renderer/dist to root
- [kylin.electron.json](kylin.electron.json): Production config
- [kylin.dev.electron.json](kylin.dev.electron.json): Development config overrides

## Packaging Notes

- electron-builder config in root package.json `build` field
- extraResources: kylin.electron.json, WebGLBuild/
- files: electron/, node_modules/, index.html, assets/
- NSIS installer uses npmmirror for faster downloads in China
- Auto-update URL: https://shv-software.oss-cn-zhangjiakou.aliyuncs.com/Electron-Packages/qfl-car

## Version Management

- Root package.json `version`: Application version (used by electron-builder)
- Root package.json `render_version`: Renderer version marker
- `yarn build` auto-increments both patch versions

## Debugging

- Press Ctrl+F12 to open DevTools
- I/O logs appear in both main process console and DevTools console
- Log prefixes: `[io-terminal]`, `[io-relay]`
