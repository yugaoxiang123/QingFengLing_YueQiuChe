# 月壤车（qfcar）

一个基于 Electron 的桌面应用：主进程负责创建窗口与更新能力，可加载 Unity WebGL（默认）或渲染端（Vite + React）。

## 项目架构

- **主进程（Electron Main）**：位于 [electron/main.js](file:///d:/WorkSpace/qing-feng-ling/car/electron/main.js)，负责：
  - 读取运行配置（开发/生产）
  - 创建主窗口并加载页面（Unity WebGL / 本地 HTML / 远程 URL）
  - 单实例锁（防止重复启动）
  - 自动更新（`electron-updater`，生产环境启用）
- **Unity WebGL（可选/默认入口）**：位于 [WebGLBuild](file:///d:/WorkSpace/qing-feng-ling/car/WebGLBuild)
  - 通过主进程内置静态服务加载（避免 `file://` 下 wasm/CORS 问题）
  - 静态服务会添加 COOP/COEP 响应头，提升 Unity Threads/SharedArrayBuffer 兼容性
- **渲染进程（Renderer）**：位于 [renderer](file:///d:/WorkSpace/qing-feng-ling/car/renderer)，使用 Vite 构建产物到 `renderer/dist`。
- **产物同步**：打包时将 `renderer/dist/index.html` 与 `renderer/dist/assets/` 同步到仓库根目录（供 `electron-builder` 打包），脚本见 [scripts/sync-renderer-dist.js](file:///d:/WorkSpace/qing-feng-ling/car/scripts/sync-renderer-dist.js)。
- **打包器**：使用 `electron-builder`，配置在根 [package.json](file:///d:/WorkSpace/qing-feng-ling/car/package.json) 的 `build` 字段。

## 目录结构

```
car/
  electron/                 # Electron 主进程
    main.js
    static-server.js        # 内置静态服务（Unity WebGL 使用）
  renderer/                 # 前端渲染工程（Vite + React）
    src/
    vite.config.ts
  WebGLBuild/               # Unity WebGL 导出产物（index.html + Build/*）
  scripts/                  # 构建辅助脚本
    electron-build.js
    sync-renderer-dist.js
  builder/                  # electron-builder 钩子等
    afterSign.js
  kylin.electron.json       # 生产/打包运行配置（会被打入安装包 resources）
  kylin.dev.electron.json   # 开发运行配置（本地开发覆盖）
```

## 组成部分与版本

- **应用版本**：根 `package.json` 的 `version`（当前：0.1.2）
- **渲染版本**：根 `package.json` 的 `render_version`（当前：0.1.2，用于内部标记）
- **主进程关键依赖**
  - Electron：18.0.2
  - electron-builder：^23.1.0
  - electron-updater：^5.0.5
- **渲染端关键依赖**
  - React：^19.1.1
  - Vite：^5.4.14

以上版本可在 [package.json](file:///d:/WorkSpace/qing-feng-ling/car/package.json) 与 [renderer/package.json](file:///d:/WorkSpace/qing-feng-ling/car/renderer/package.json) 查看。

## 运行配置（开发 / 生产）

项目通过两个 JSON 配置控制“窗口模式、入口页面、更新地址”等：

- **开发配置**：[kylin.dev.electron.json](file:///d:/WorkSpace/qing-feng-ling/car/kylin.dev.electron.json)
  - `entry`: `http://localhost:3000`（对应渲染端 dev server）
  - `window_mode`: `max`
- **生产配置**：[kylin.electron.json](file:///d:/WorkSpace/qing-feng-ling/car/kylin.electron.json)
  - `entry`: `./WebGLBuild/index.html`（Unity WebGL 入口）
  - `local_server_root`: `./WebGLBuild`（启用内置静态服务）
  - `local_server_port`: `17888`（可按需调整）
  - `window_mode`: `kiosk`
  - `auto_update_url`: 自动更新地址（见下文“发布部署”）

主进程读取规则：
- **开发态**：读取仓库根目录 `kylin.electron.json`，并用 `kylin.dev.electron.json` 覆盖同名字段
- **打包态**：读取 `resources/kylin.electron.json`（`electron-builder` 的 `extraResources` 会把它带入安装包）

## IO 模块联动（输入 / 继电器）

### IO 输入（6 路）

- Socket Server：默认 `192.168.1.95:8234`
- 主进程轮询读取 6 路输入信号（协议见需求文档），并在信号变化时注入键盘按键
- 当前映射（第 1~6 路）：`W / S / A / D / Q / E`
- 关键日志：
  - 主进程控制台：`[io-terminal] ...`
  - DevTools Console：按 `Ctrl+F12` 打开后可看到同样的 `[io-terminal] {...}` JSON 日志

对应代码：
- [main.js](file:///d:/WorkSpace/qing-feng-ling/car/electron/main.js)
- [io-terminal-client.js](file:///d:/WorkSpace/qing-feng-ling/car/electron/io-terminal-client.js)

### Unity → Electron 触发继电器（console-message 解析）

Electron 会监听渲染进程 console 输出（`console-message` 事件）。当 Unity WebGL 在浏览器控制台输出**一条完整消息**等于以下文本时，Electron 会通过 Socket 向 IO 模块发送继电器闭合指令，并在 10 秒后自动发送断开指令：

- 触发文本（默认）：`IO_RELAY:PULSE`
- 闭合指令：`01 05 00 00 FF 00 8C 3A`
- 断开指令：`01 05 00 00 00 00 CD CA`
- 脉冲时长：10 秒（可配置）

Unity C# 示例（任意脚本/按钮/事件里调用均可）：

```csharp
using UnityEngine;

public class IORelayTrigger : MonoBehaviour
{
    public void PulseRelay()
    {
        Debug.Log("IO_RELAY:PULSE");
    }
}
```

说明：
- WebGL 构建中 `Debug.Log(...)` 会输出到浏览器 Console；Electron 主进程会捕获并解析
- 若 10 秒内重复触发，会重新计时（保持闭合，直到最后一次触发后的 10 秒再断开）
- 关键日志：
  - 主进程控制台：`[io-relay] ...`
  - DevTools Console：按 `Ctrl+F12` 打开后可看到同样的 `[io-relay] {...}` JSON 日志

对应代码：
- [main.js](file:///d:/WorkSpace/qing-feng-ling/car/electron/main.js)
- [io-relay.js](file:///d:/WorkSpace/qing-feng-ling/car/electron/io-relay.js)

配置项：
- 生产：[kylin.electron.json](file:///d:/WorkSpace/qing-feng-ling/car/kylin.electron.json) 的 `io_relay`
- 开发：[kylin.dev.electron.json](file:///d:/WorkSpace/qing-feng-ling/car/kylin.dev.electron.json) 的 `io_relay`
  - `enabled`: 是否启用
  - `host` / `port`: IO 模块地址
  - `pulse_ms`: 闭合保持时间（毫秒）
  - `trigger_text`: 触发文本（只要 console message 包含该字符串即触发）

## 本地开发

### 环境要求

- Node.js：20.x（当前工程在 20.12.0 环境验证通过）
- Yarn：1.x

### 安装依赖

```bash
yarn install
cd renderer
yarn install
```

### 启动（渲染 + Electron）

在仓库根目录执行：

```bash
yarn dev
```

说明：
- 渲染端启动在 `http://localhost:3000`
- Electron 启动后会根据 `kylin.dev.electron.json` 加载该地址

### 启动（Unity WebGL + Electron，全屏）

在仓库根目录执行：

```bash
yarn dev:unity
```

说明：
- Electron 会启动内置静态服务并加载 Unity 的 `WebGLBuild/index.html`
- 默认 kiosk 全屏（可通过配置 `window_mode` 调整）
- 如果在部分机器上出现 Unity Splash 花屏/卡住等 GPU/驱动兼容问题，可在生产配置中设置 `chromium_args.use-angle=gl`（当前已默认开启）

## 打包命令与打包步骤

### 常用命令

- 构建渲染端：`yarn build:renderer`
- 同步渲染产物到根目录：`yarn sync:renderer`
- 一键构建并打包（推荐）：`yarn build`
- 生成安装包：`yarn package`
- 只生成目录（不出安装包）：`yarn package:dir`

### 标准打包流程（Windows）

1. 安装依赖（根目录与 renderer）
2. 执行一键构建：
   ```bash
-==5天如同5
   ```
   该命令会：
   - 自动把 `version` 与 `render_version` 的 patch 位自增（例如 0.1.2 → 0.1.3）
   - 构建 `renderer`
   - 将 `renderer/dist` 同步到根目录（`index.html` + `assets/`）
   - 调用 `electron-builder` 进行打包
3. 生成物输出目录：`dist/`（由 `build.directories.output` 决定）

**若构建时出现「从 GitHub 下载 NSIS 超时」**（如 `Get "https://github.com/electron-userland/electron-builder-binaries/...": connection ... failed`）：
- 构建脚本已默认使用国内镜像（npmmirror）下载 NSIS，直接重试 `yarn build` 即可。
- 若需改用其他镜像，可设置环境变量后再构建，例如：
  ```bash
  # PowerShell
  $env:ELECTRON_BUILDER_BINARIES_MIRROR="https://registry.npmmirror.com/-/binary/electron-builder-binaries/"; yarn build
  ```
- 仅需打包目录、不生成安装包时，可执行 `yarn package:dir`，不会下载 NSIS。

## 发布部署位置（自动更新与安装包发布）

### 安装包产物

打包完成后安装包位于：
- `dist/` 目录（例如 NSIS 安装包等）

### 自动更新（electron-updater）

生产配置中的自动更新地址：
- `auto_update_url`：见 [kylin.electron.json](file:///d:/WorkSpace/qing-feng-ling/car/kylin.electron.json)
- 当前值：`https://shv-software.oss-cn-zhangjiakou.aliyuncs.com/Electron-Packages/qfl-car`

部署约定（通用做法）：
- 将 `electron-builder` 生成的更新相关文件（例如 `latest.yml`、安装包文件等）上传到 `auto_update_url` 对应的目录
- 客户端在生产环境启动后会检查该地址并下载更新（配置 `auto_update_auto_restart=true` 时可下载完成后自动重启安装）

## 备注

- Electron 打包配置（目标平台、输出目录、extraResources、files 等）均在根 [package.json](file:///d:/WorkSpace/qing-feng-ling/car/package.json) 的 `build` 字段中维护。
