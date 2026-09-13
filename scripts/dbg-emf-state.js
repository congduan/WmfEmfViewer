// 逐记录回放 EMF 并打印对象/样式状态变化与绘图调用时生效的样式（调试用）
// 用法：node scripts/dbg-emf-state.js <file> [起始记录号] [结束记录号]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'out/metafileParser.browser.js'));
const MetafileParser = window.MetafileParser, EmfDrawer = window.EmfDrawer;
const SvgContext = require(path.join(ROOT, 'src/modules/svgContext.js'));

const fn = process.argv[2];
const from = Number(process.argv[3] || 0);
const to = Number(process.argv[4] || 1e9);
const data = new Uint8Array(fs.readFileSync(fn));
const p = new MetafileParser(data);
const r = p.parse();

const L = [];
const watch = {
  processEmfCreateBrushIndirect(d) { L.push(`  CreateBrush idx=${rd(d, 0)} style=${rd(d, 4)} color=0x${(rd(d, 8) >>> 0).toString(16)}`); },
  processEmfCreatePen(d) { L.push(`  CreatePen idx=${rd(d, 0)} style=${rd(d, 4)} width=${rd(d, 8)} color=0x${(rd(d, 12) >>> 0).toString(16)}`); },
  processEmfExtCreatePen(d) { L.push(`  ExtCreatePen idx=${rd(d, 0)}`); },
  processEmfDeleteObject(d) { L.push(`  DeleteObject obj=0x${(rd(d, 0) >>> 0).toString(16)}`); },
  processEmfSelectObject(d) {
    const h = rd(d, 0) >>> 0;
    L.push(`  SelectObject 0x${h.toString(16)} -> ${this.ctx.fillStyle} / ${this.ctx.strokeStyle}`);
  },
  processEmfPolygon16(d) { L.push(`  Polygon16 n=${rd(d, 0)} fill=${this.ctx.fillStyle} stroke=${this.ctx.strokeStyle}`); },
  processEmfPolyPolygon16(d) { L.push(`  PolyPolygon16 n=${rd(d, 0)} polys=${rd(d, 4)} fill=${this.ctx.fillStyle} stroke=${this.ctx.strokeStyle}`); },
  processEmfPolyline16(d) { L.push(`  Polyline16 n=${rd(d, 0)} stroke=${this.ctx.strokeStyle}`); },
  processEmfGdiComment(d) {
    const isPlus = d.length >= 8 && d[4] === 0x45 && d[5] === 0x4D && d[6] === 0x46 && d[7] === 0x2B;
    L.push(`  GdiComment len=${d.length} emfplus=${isPlus ? 1 : 0}`);
  },
};
function rd(a, o) { return a[o] | (a[o + 1] << 8) | (a[o + 2] << 16) | (a[o + 3] << 24); }

// 逐记录调用：包装 processEmfRecordType，在前后插入状态日志
let i = -1;
const origDispatch = EmfDrawer.prototype.processEmfRecordType;
EmfDrawer.prototype.processEmfRecordType = function (t, d) {
  i++;
  const on = i >= from && i <= to;
  if (on) L.push(`#${i} 0x${t.toString(16)}`);
  if (on && watch[this._lastHandler]) { /* noop */ }
  // 记录即将调用的 handler：借用查表结果
  const before = L.length;
  origDispatch.call(this, t, d);
  if (on && L.length === before) L.push(`   (no state change)`);
  return undefined;
};

const ctx = new SvgContext();
const drawer = new EmfDrawer(ctx);
// 在 dispatch 前注入 watch：直接包所有 watch 方法
for (const k of Object.keys(watch)) {
  const f = drawer[k];
  drawer[k] = function (...args) { watch[k].apply(this, args); return f.apply(this, args); };
}
const realLog = console.log;
console.log = () => {};
drawer.draw(r, { viewWidth: 800, viewHeight: 600 });
console.log = realLog;
console.log(L.join('\n'));
