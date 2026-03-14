const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function bumpPatch(v) {
  const parts = String(v || '0.0.0').split('.');
  const major = Number(parts[0] || 0);
  const minor = Number(parts[1] || 0);
  const patch = Number(parts[2] || 0) + 1;
  return `${major}.${minor}.${patch}`;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function run(cmd, args, cwd = process.cwd()) {
  const isWin = process.platform === 'win32';
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: isWin
  });
  if (res.error) {
    throw res.error;
  }
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} 失败，退出码：${res.status}`);
  }
}

async function main() {
  const root = process.cwd();
  const pkgPath = path.join(root, 'package.json');

  console.log('正在修改版本号');
  const pkg = readJson(pkgPath);
  pkg.version = bumpPatch(pkg.version);
  pkg.render_version = bumpPatch(pkg.render_version || '0.1.0');

  const productName = process.argv[2];
  if (productName) {
    pkg.productName = productName;
    pkg.build = pkg.build || {};
    pkg.build.productName = productName;
    if (pkg.build.nsis && pkg.build.nsis.artifactName) {
      pkg.build.nsis.artifactName = `${productName} ` + '.${version}.${ext}';
    }
  }

  const name = process.argv[3];
  if (name) {
    pkg.name = name;
    if (pkg.build && pkg.build.appId) {
      const prefix = String(pkg.build.appId).match(/^.*\./);
      if (prefix && prefix[0]) {
        pkg.build.appId = `${prefix[0]}${name}`;
      }
    }
  }

  writeJson(pkgPath, pkg);
  console.log('新版本：', pkg.version);

  const webglIndex = path.join(root, 'WebGLBuild', 'index.html');
  if (!fs.existsSync(webglIndex)) {
    throw new Error(`未找到 Unity WebGL 入口：${webglIndex}，请先导出并放入 WebGLBuild 目录`);
  }

  // 使用国内镜像下载 NSIS 等二进制，避免从 GitHub 下载超时（可被环境变量覆盖）
  // 注意：base URL 必须以 / 结尾，否则会拼成 .../binariesnsis-3.0.4.1/... 导致 404
  if (!process.env.ELECTRON_BUILDER_BINARIES_MIRROR) {
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR =
      'https://registry.npmmirror.com/-/binary/electron-builder-binaries/';
  }

  process.argv = process.argv.slice(0, 2);
  require('electron-builder/cli');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
