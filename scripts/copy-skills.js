const fs = require('fs');
const path = require('path');

const sourceDir = path.join(process.env.HOME || process.env.USERPROFILE, '.pi', 'agent', 'skills');
const targetDir = path.join(__dirname, '..', 'skills');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`Skills source not found: ${src}`);
    return;
  }

  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true });
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(sourceDir, targetDir);
console.log('Skills copied successfully.');
