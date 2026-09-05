// 冒烟测试：用项目 test_files/ 中的样例验证库的解析与 SVG 渲染
// 用法：node test/smoke-test.js [文件...]（默认自动挑选样例）
const fs = require('fs');
const path = require('path');

const lib = require('..');

const TEST_FILES_DIR = path.join(__dirname, '..', '..', '..', 'test_files');

function pickSamples() {
    const argvFiles = process.argv.slice(2).map((f) => path.resolve(f));
    if (argvFiles.length) return argvFiles;

    if (!fs.existsSync(TEST_FILES_DIR)) {
        console.error('未找到 test_files 目录:', TEST_FILES_DIR);
        process.exit(1);
    }
    const all = fs.readdirSync(TEST_FILES_DIR).filter((f) => /\.(wmf|emf)$/i.test(f));
    // 每种格式各挑 3 个，优先小文件加快测试
    const byExt = {};
    for (const f of all) {
        const ext = path.extname(f).toLowerCase();
        (byExt[ext] = byExt[ext] || []).push(f);
    }
    const samples = [];
    for (const ext of Object.keys(byExt)) {
        byExt[ext].sort((a, b) => {
            const sa = fs.statSync(path.join(TEST_FILES_DIR, a)).size;
            const sb = fs.statSync(path.join(TEST_FILES_DIR, b)).size;
            return sa - sb;
        });
        samples.push(...byExt[ext].slice(0, 3));
    }
    return samples.map((f) => path.join(TEST_FILES_DIR, f));
}

let passed = 0;
let failed = 0;

for (const file of pickSamples()) {
    const name = path.basename(file);
    try {
        const data = fs.readFileSync(file);
        const expectedExt = path.extname(file).toLowerCase().replace('.', '');

        // 1) 格式检测
        const type = lib.detectFileType(data);
        const typeOk = type === expectedExt || type === 'emf+' || type === 'placeable-wmf';

        // 2) 解析
        const parsed = lib.parseMetafile(data);
        if (parsed.error) throw new Error('parse error: ' + parsed.error);
        if (!parsed.header) throw new Error('missing header');
        if (!Array.isArray(parsed.records) || parsed.records.length === 0) {
            throw new Error('no records');
        }

        // 3) SVG 渲染
        const svg = lib.renderToSvg(data, { viewWidth: 400, viewHeight: 300 });
        if (typeof svg !== 'string' || !svg.startsWith('<?xml') || !svg.includes('<svg')) {
            throw new Error('invalid SVG output');
        }

        const typeNote = typeOk ? '' : ` (ext=${expectedExt}, detected=${type})`;
        console.log(`PASS ${name} [${parsed.fileType}] ${parsed.records.length} records, svg ${svg.length}B${typeNote}`);
        passed++;
    } catch (e) {
        console.error(`FAIL ${name}: ${e.message}`);
        failed++;
    }
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
