const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: [path.join(__dirname, 'webview', 'src', 'index.tsx')],
  bundle: true,
  outfile: path.join(__dirname, 'webview', 'out', 'bundle.js'),
  platform: 'browser',
  format: 'iife',
  external: [],
  sourcemap: true,
  minify: false,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
}).catch(() => process.exit(1));
