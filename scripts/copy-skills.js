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

// Bundle the PI harness files so the shipped extension is self-contained.
// The Context7 API key is deliberately NOT copied — secrets never go in a vsix.
const agentDir = path.join(process.env.HOME || process.env.USERPROFILE, '.pi', 'agent');
const harnessDir = path.join(__dirname, '..', 'harness');
fs.mkdirSync(harnessDir, { recursive: true });
for (const file of ['SYSTEM.md', 'AGENTS.md']) {
  const src = path.join(agentDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(harnessDir, file));
    console.log(`Bundled harness/${file}`);
  } else {
    console.warn(`Harness source not found: ${src}`);
  }
}
