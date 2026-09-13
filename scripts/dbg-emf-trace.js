// 调试用：渲染单个 EMF/WMF 并打印关键记录处理轨迹与产出的 SVG 元素统计。
// 用法：node scripts/dbg-emf-trace.js <file> [handlerRegex]
//   handlerRegex 形如 '^processEmf(Stretch|BitBlt)'，匹配的 handler 每次调用都会打印
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'out/metafileParser.browser.js'));
const MetafileParser = window.MetafileParser, EmfDrawer = window.EmfDrawer, EmfPlusDrawer = window.EmfPlusDrawer, WmfDrawer = window.WmfDrawer;
const SvgContext = require(path.join(ROOT, 'src/modules/svgContext.js'));

const fn = process.argv[2];
const re = process.argv[3] ? new RegExp(process.argv[3]) : null;
const data = new Uint8Array(fs.readFileSync(fn));
const p = new MetafileParser(data);
const r = p.parse();
console.log('fileType=', p.fileType, 'recs=', r.records.length, 'header=', JSON.stringify(r.header && r.header.bounds));

// 轨迹日志先缓冲，draw() 期间 console.log 被临时静音
const trace = [];
if (re) {
  const names = Object.keys(Object.getOwnPropertyDescriptors(EmfDrawer.prototype)).filter(k => re.test(k));
  console.log('instrumenting:', names.join(','));
  for (const n of names) {
    const f = EmfDrawer.prototype[n];
    EmfDrawer.prototype[n] = function (d) { trace.push('CALLED ' + n + ' len' + (d && d.length)); return f.call(this, d); };
  }
}
const noop = () => {};
const log = console.log;
const ctx = new SvgContext();
let drawer;
console.log = noop;
if (p.fileType === 'emf') drawer = new EmfDrawer(ctx);
else if (p.fileType === 'emf+') drawer = new EmfPlusDrawer(ctx);
else drawer = new WmfDrawer(ctx);
const dbg = globalThis.__WMF_DEBUG__;
drawer.draw(r, { viewWidth: 800, viewHeight: 600 });
console.log = log;
for (const t of trace) console.log(t);
const svg = ctx.getSvg();
console.log('svg len', svg.length);
const els = svg.match(/<(path|rect|image|polygon|polyline|circle|ellipse|text|g|defs|clipPath|linearGradient)\b/g) || [];
const cnt = {};
for (const e of els) cnt[e] = (cnt[e] || 0) + 1;
console.log('elements', JSON.stringify(cnt));
console.log('canvas', drawer._canvasW, drawer._canvasH);
