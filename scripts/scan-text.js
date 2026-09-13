// 文本渲染覆盖扫描：统计每个语料文件中「含文本记录」与「输出含 <text> 元素」的对照。
// 用于发现"文件有文本记录但渲染器完全没输出文本"的系统性缺陷。
// 用法：node scripts/scan-text.js <emf目录> [--diff <diffDir>]
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'out/metafileParser.browser.js'));
const MetafileParser = window.MetafileParser, EmfDrawer = window.EmfDrawer, EmfPlusDrawer = window.EmfPlusDrawer, WmfDrawer = window.WmfDrawer;
const SvgContext = require(path.join(ROOT, 'src/modules/svgContext.js'));

const TEXT_RECS = new Set([0x53, 0x54, 0x60, 0x61, 0x50, 0x51].map(x => x)); // 0x53/54 EXTTEXTOUT, 0x60/61 POLYTEXT
const dir = process.argv[2];
let diffDir = null;
const di = process.argv.indexOf('--diff');
if (di > 0) diffDir = process.argv[di + 1];

const noop = () => {};
const realLog = console.log;
const files = fs.readdirSync(dir).filter(f => /\.emf$/i.test(f)).sort();
const rows = [];
for (const f of files) {
  const base = f.replace(/\.emf$/i, '');
  let parsed, svg, recs = 0, textRecs = 0, drawString = 0;
  try {
    const p = new MetafileParser(new Uint8Array(fs.readFileSync(path.join(dir, f))));
    parsed = p.parse();
    recs = parsed.records.length;
    for (const r of parsed.records) {
      const t = r.type >>> 0;
      if (t === 0x53 || t === 0x54 || t === 0x60 || t === 0x61) textRecs++;
      if (t === 0x46 && r.data && r.data.length >= 12 && r.data[4] === 0x45 && r.data[5] === 0x4D && r.data[6] === 0x46 && r.data[7] === 0x2B) {
        // EMF+ 注释：统计 DrawString 出现次数（粗略：在 data 中搜索 EmfPlusDrawString 类型标志不可靠，略）
      }
    }
    const ctx = new SvgContext();
    let drawer;
    if (p.fileType === 'emf') drawer = new EmfDrawer(ctx);
    else if (p.fileType === 'emf+') drawer = new EmfPlusDrawer(ctx);
    else drawer = new WmfDrawer(ctx);
    console.log = noop;
    drawer.draw(parsed, { viewWidth: 800, viewHeight: 600 });
    console.log = realLog;
    svg = ctx.getSvg();
  } catch (e) { console.log = realLog; rows.push({ base, err: e.message }); continue; }
  const nText = (svg.match(/<text\b/g) || []).length;
  rows.push({ base, recs, textRecs, nText });
}
let mismatch = 0;
console.log('base        recs  textRecs  <text>');
for (const r of rows) {
  if (r.err) { console.log(r.base, 'ERROR', r.err); continue; }
  if (r.textRecs > 0 && r.nText === 0) mismatch++;
  if (r.textRecs > 0) console.log(`${r.base.padEnd(11)} ${String(r.recs).padStart(5)} ${String(r.textRecs).padStart(8)} ${String(r.nText).padStart(6)}`);
}
console.log('\n含文本记录的文件: %d, 其中输出 0 个 <text>: %d', rows.filter(r => r.textRecs > 0).length, mismatch);
