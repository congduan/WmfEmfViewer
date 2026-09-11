// 临时诊断：统计 test-000 的 EMF+ 记录构成与 SVG 节点产出
const fs = require('fs');
global.window = {};
require('../out/metafileParser.browser.js');
const P = window.MetafileParser;
const E = window.EmfDrawer;
const EP = window.EmfPlusParser;
const SvgContext = require('../src/modules/svgContext.js');
const w = s => process.stdout.write(s + '\n');
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const buf = fs.readFileSync('test_files/ref-emf-corpus/emf-valid/test-000.emf');
const p = new P(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
const r = p.parse();
const all = [];
for (const rec of r.records) {
  if (rec.type === 0x46) {
    try { for (const x of new EP(rec.data).parseEmfPlusRecords(rec.data)) all.push(x); } catch (e) {}
  }
}
const cnt = {};
for (const x of all) cnt[x.type] = (cnt[x.type] || 0) + 1;
w('EMF+ records: ' + all.length);
w('types: ' + Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t, c]) => '0x' + (+t).toString(16) + '=' + c).join(' '));
const ctx = new SvgContext();
new E(ctx).draw(r, { viewWidth: 800, viewHeight: 600 });
const svg = ctx.getSvg();
w('svg KB=' + (svg.length / 1024 | 0));
for (const tag of ['path', 'rect', 'text', 'image', 'clipPath']) {
  w(tag + ': ' + ((svg.match(new RegExp('<' + tag + '\\b', 'g')) || []).length));
}
