const fs = require('fs');
const path = require('path');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  const root = process.cwd();
  const rendererDist = path.join(root, 'renderer', 'dist');
  const indexSrc = path.join(rendererDist, 'index.html');
  const assetsSrc = path.join(rendererDist, 'assets');

  if (!fs.existsSync(indexSrc)) {
    throw new Error(`未找到渲染端产物：${indexSrc}，请先执行 yarn build:renderer`);
  }

  copyFile(indexSrc, path.join(root, 'index.html'));

  rmrf(path.join(root, 'assets'));
  if (fs.existsSync(assetsSrc)) {
    copyDir(assetsSrc, path.join(root, 'assets'));
  }
}

main();
