// 扫描语料中的位图记录，报告被像素预算上限拦下的样本（调试用）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'out/metafileParser.browser.js'));
const MetafileParser = window.MetafileParser;

const dir = process.argv[2];
const BUDGET = Number(process.argv[3] || 1572864);
const files = fs.readdirSync(dir).filter(f => /\.emf$/i.test(f)).sort();
const rows = [];
for (const f of files) {
  const p = new MetafileParser(new Uint8Array(fs.readFileSync(path.join(dir, f))));
  const r = p.parse();
  const hits = [];
  for (const rec of r.records) {
    const t = rec.type >>> 0;
    if (![0x4C, 0x4D, 0x51, 0x72, 0x74].includes(t)) continue;
    const d = rec.data; if (!d || d.length < 72) continue;
    let offBmi, cbBmi, offBits, cbBits;
    if (t === 0x51) { offBmi = d[40] | d[41] << 8 | d[42] << 16 | d[43] << 24; cbBmi = d[44] | d[45] << 8 | d[46] << 16 | d[47] << 24; offBits = d[48] | d[49] << 8 | d[50] << 16 | d[51] << 24; }
    else { offBmi = d[76] | d[77] << 8 | d[78] << 16 | d[79] << 24; cbBmi = d[80] | d[81] << 8 | d[82] << 16 | d[83] << 24; offBits = d[84] | d[85] << 8 | d[86] << 16 | d[87] << 24; }
    cbBits = t === 0x51 ? (d[52] | d[53] << 8 | d[54] << 16 | d[55] << 24) : (d[88] | d[89] << 8 | d[90] << 16 | d[91] << 24);
    const bmi = offBmi - 8;
    if (bmi < 0 || bmi + 40 > d.length) continue;
    const w = d[bmi + 4] | d[bmi + 5] << 8 | d[bmi + 6] << 16 | d[bmi + 7] << 24;
    const hRaw = d[bmi + 8] | d[bmi + 9] << 8 | d[bmi + 10] << 16 | d[bmi + 11] << 24;
    const bitCount = d[bmi + 14] | d[bmi + 15] << 8;
    hits.push({ t: '0x' + t.toString(16), w, h: Math.abs(hRaw), bpp: bitCount, px: w * Math.abs(hRaw), over: w * Math.abs(hRaw) > BUDGET });
  }
  if (hits.length) rows.push({ f, hits });
}
let overCount = 0, overFiles = new Set();
for (const r of rows) {
  const o = r.hits.filter(h => h.over);
  if (o.length) { overCount += o.length; overFiles.add(r.f); }
}
console.log('含位图记录的文件数:', rows.length, ' 其中含超预算位图:', overFiles.size, ' 超预算位图记录数:', overCount, ' (预算', BUDGET, 'px)');
for (const r of rows) {
  const o = r.hits.filter(h => h.over);
  if (!o.length) continue;
  console.log(r.f, '->', o.map(h => `${h.w}x${h.h}@${h.bpp}bpp(${h.t},${(h.px / 1e6).toFixed(2)}Mpx)`).join(' '));
}
