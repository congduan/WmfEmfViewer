// 扫描语料中 BLT 类记录的光栅操作码（ROP）与是否携带 DIB，
// 用于确认 PATCOPY/BLACKNESS/WHITENESS 等「无源位图」分支的覆盖率。
// 用法：node scripts/scan-rops.js <emf目录>
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'out/metafileParser.browser.js'));
const MetafileParser = window.MetafileParser;

const ROP_NAME = {};
function ropName(r) {
  switch (r >>> 0) {
    case 0x00000042: return 'BLACKNESS';
    case 0x00ff0062: return 'WHITENESS';
    case 0x00f00021: return 'PATCOPY';
    case 0x005a0049: return 'PATINVERT';
    case 0x00cc0020: return 'SRCCOPY';
    case 0x00660046: return 'SRCINVERT';
    case 0x00330008: return 'NOTSRCCOPY';
    case 0x00ee0086: return 'SRCAND';
    case 0x00bb0226: return 'NOTSRCERASE';
    case 0x00c000ca: return 'MERGECOPY';
    case 0x00a000c9: return 'PATPAINT';
    case 0x00aa0029: return 'NOOP';
    case 0x00fb0a09: return 'DSPDxax';
    default: return '0x' + (r >>> 0).toString(16);
  }
}

const dir = process.argv[2];
const files = fs.readdirSync(dir).filter(f => /\.emf$/i.test(f)).sort();
const ropAgg = new Map();
const noDibAgg = new Map();
for (const f of files) {
  let parsed;
  try { parsed = new MetafileParser(new Uint8Array(fs.readFileSync(path.join(dir, f)))).parse(); } catch (e) { continue; }
  for (const r of parsed.records) {
    const t = r.type >>> 0, d = r.data;
    if (![0x4c, 0x4d, 0x51, 0x72, 0x74].includes(t)) continue;
    if (!d || d.length < 92) continue;
    let rop, offBmi, cbBmi, offBits;
    if (t === 0x51) { rop = dw(d, 60); offBmi = dw(d, 40); cbBmi = dw(d, 44); offBits = dw(d, 48); }
    else { rop = dw(d, 32); offBmi = dw(d, 76); cbBmi = dw(d, 80); offBits = dw(d, 84); }
    const k = (rop >>> 0);
    if (!ropAgg.has(k)) ropAgg.set(k, { name: ropName(k), n: 0, files: new Set() });
    ropAgg.get(k).n++; ropAgg.get(k).files.add(f);
    if (!offBmi || !cbBmi) {
      const kk = ropName(k);
      if (!noDibAgg.has(kk)) noDibAgg.set(kk, { n: 0, files: new Set() });
      noDibAgg.get(kk).n++; noDibAgg.get(kk).files.add(f);
    }
  }
}
function dw(d, o) { return d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24); }
console.log('=== 全部 BLT 记录 ROP 分布 ===');
for (const [k, v] of [...ropAgg].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${v.name.padEnd(12)} 0x${k.toString(16).padStart(8, '0')}  n=${String(v.n).padStart(5)}  文件 ${v.files.size}`);
}
console.log('\n=== 无源 DIB（offBmiSrc/cbBmiSrc 为 0）的 ROP ===');
for (const [k, v] of [...noDibAgg].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${k.padEnd(12)} n=${String(v.n).padStart(5)}  文件数 ${v.files.size}  例: ${[...v.files].slice(0, 5).join(' ')}`);
}
