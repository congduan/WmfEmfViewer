// 把单个 WMF/EMF 渲染成 SVG + PNG，便于人工目检（对比外部渲染结果时用于快速预览）。
// 用法：node scripts/render-one.js <file> [outPng]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
global.window = {};
require(path.join(__dirname, '..', 'out', 'metafileParser.browser.js'));
const MetafileParser = window.MetafileParser;
const SvgContext = require('../src/modules/svgContext.js');

const fn = process.argv[2];
const outPng = process.argv[3] || '/tmp/render-one.png';
const buf = fs.readFileSync(fn);
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const noop = () => {};
const rl = console.log;
console.log = noop;
let result, fileType;
try {
    const p = new MetafileParser(data);
    result = p.parse();
    fileType = p.fileType;
} finally { console.log = rl; }
console.log('fileType:', fileType, 'records:', result.records.length);

const W = 800, H = 600;
const ctx = new SvgContext();
ctx.canvas.width = W; ctx.canvas.height = H;
let drawer;
if (fileType === 'wmf' || fileType === 'placeable-wmf') drawer = new window.WmfDrawer(ctx);
else if (fileType === 'emf') drawer = new window.EmfDrawer(ctx);
else drawer = new window.EmfPlusDrawer(ctx);
console.log = noop;
try { drawer.draw(result, { viewWidth: W, viewHeight: H }); } finally { console.log = rl; }

const svg = ctx.getSvg();
const svgPath = outPng.replace(/\.png$/, '.svg');
fs.writeFileSync(svgPath, svg);
execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-b', 'white', '-o', outPng, svgPath], { stdio: 'ignore' });
console.log('wrote', svgPath, '+', outPng);
