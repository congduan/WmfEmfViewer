// 批量语料验证脚本：用项目解析器批量解析 test_files 下新增的语料目录，
// 统计解析成功/失败率。损坏样本（emf-corrupted）预期会失败，单独统计。
//
// 用法：node scripts/validate-corpus.js [目录...]
// 不带参数时扫描全部语料目录。
const fs = require('fs');
const path = require('path');

global.window = {};
require('../out/metafileParser.browser.js');
const MetafileParser = window.MetafileParser;

const CORPUS_DIRS = [
  'lo-wmf-corpus',
  'ref-emf-corpus/emf-valid',
  'ref-emf-corpus/emf-ea',
  'ref-emf-corpus/emf-corrupted',
  'sample-wmf',
];

const testRoot = path.join(__dirname, '..', 'test_files');
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : CORPUS_DIRS;

const summary = {};
let maxFailSamples = 5;

for (const dir of dirs) {
  const absDir = path.join(testRoot, dir);
  if (!fs.existsSync(absDir)) {
    console.log(`跳过（不存在）: ${dir}`);
    continue;
  }
  const files = fs.readdirSync(absDir).filter(f => /\.(wmf|emf)$/i.test(f));
  let ok = 0, fail = 0;
  const failSamples = [];
  for (const f of files) {
    try {
      const buf = fs.readFileSync(path.join(absDir, f));
      const parser = new MetafileParser(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
      const parsed = parser.parse();
      if (parsed && parsed.header && parsed.records && parsed.records.length > 0) {
        ok++;
      } else {
        fail++;
        if (failSamples.length < maxFailSamples) failSamples.push(`${f}: 无有效header/records`);
      }
    } catch (e) {
      fail++;
      if (failSamples.length < maxFailSamples) failSamples.push(`${f}: ${String(e.message).slice(0, 80)}`);
    }
  }
  summary[dir] = { total: files.length, ok, fail };
  console.log(`\n${dir}: 共 ${files.length} 个, 解析成功 ${ok}, 失败 ${fail}`);
  failSamples.forEach(s => console.log(`   - ${s}`));
}

console.log('\n' + '='.repeat(60));
console.log('汇总:');
for (const [d, s] of Object.entries(summary)) {
  const pct = s.total ? Math.round(s.ok / s.total * 100) : 0;
  console.log(`  ${d.padEnd(28)} ${String(s.ok).padStart(4)}/${String(s.total).padStart(4)} (${pct}%)`);
}
