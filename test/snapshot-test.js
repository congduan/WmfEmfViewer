#!/usr/bin/env node

// WMF/EMF/EMF+ 全量样例快照测试（回归安全网）
//
// 对 test_files/ 下所有 .wmf/.emf 样例执行「解析 -> 渲染到 SvgContext -> 序列化 SVG」，
// 将每个文件的 SVG sha256 与基线（test/snapshots/snapshots.json）比对。
// 渲染行为发生任何变化（包括意外回归）都会使对应 hash 改变而测试失败。
//
// 用法：
//   node test/snapshot-test.js           # 校验（CI / npm test）
//   node test/snapshot-test.js --update  # 有意变更渲染行为后重新生成基线
//
// 注意：直接加载 src/ 源码模块（而非构建产物），使重构与渲染行为变化
// 在源头即可被发现；构建产物由 test/runTest.js 与 test:lib 各自覆盖。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MetafileParser = require('../src/utils/metafileParser');
const SvgContext = require('../src/modules/svgContext');
const WmfDrawer = require('../src/modules/drawers/wmfDrawer');
const EmfDrawer = require('../src/modules/drawers/emfDrawer');
const EmfPlusDrawer = require('../src/modules/drawers/emfPlusDrawer');

const TEST_FILES_DIR = path.join(__dirname, '..', 'test_files');
const SNAPSHOT_DIR = path.join(__dirname, 'snapshots');
const SNAPSHOT_FILE = path.join(SNAPSHOT_DIR, 'snapshots.json');

// 解析/绘制热路径日志量巨大，静默之；失败摘要仍用 console.error 输出
console.log = () => {};

function createDrawer(fileType, ctx) {
    if (fileType === 'wmf' || fileType === 'placeable-wmf') return new WmfDrawer(ctx);
    if (fileType === 'emf') return new EmfDrawer(ctx);
    if (fileType === 'emf+') return new EmfPlusDrawer(ctx);
    return null;
}

function sha256(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// 递归收集样例文件（相对路径排序，保证基线稳定）
function collectSamples(dir, base) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = base ? base + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
            files.push(...collectSamples(path.join(dir, entry.name), rel));
        } else if (/\.(wmf|emf)$/i.test(entry.name)) {
            files.push(rel);
        }
    }
    return files;
}

// 对单个样例产出可快照的摘要（渲染成功记 SVG hash；失败记错误摘要 hash）
function summarize(relPath) {
    const buffer = fs.readFileSync(path.join(TEST_FILES_DIR, relPath));
    const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    try {
        const parser = new MetafileParser(data);
        const result = parser.parse();
        if (result.error) {
            return { status: 'parse-error', errorHash: sha256(String(result.error)) };
        }
        const svgCtx = new SvgContext();
        const drawer = createDrawer(parser.fileType, svgCtx);
        if (!drawer) {
            return { status: 'parse-error', errorHash: sha256('unknown type: ' + parser.fileType) };
        }
        drawer.draw(result, { viewWidth: 800, viewHeight: 600 });
        const svg = svgCtx.getSvg();
        return {
            status: 'ok',
            type: parser.fileType,
            records: result.records.length,
            svgBytes: svg.length,
            svgHash: sha256(svg)
        };
    } catch (error) {
        return { status: 'render-error', errorHash: sha256(String((error && error.stack) || error)) };
    }
}

function main() {
    const update = process.argv.includes('--update');
    const samples = collectSamples(TEST_FILES_DIR, '');
    if (samples.length === 0) {
        console.error('未找到样例文件:', TEST_FILES_DIR);
        process.exit(1);
    }

    let baseline = {};
    if (fs.existsSync(SNAPSHOT_FILE)) {
        baseline = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
    }

    let passed = 0;
    let failed = 0;
    const next = {};
    const failures = [];

    for (const rel of samples) {
        const actual = summarize(rel);
        next[rel] = actual;
        const expected = baseline[rel];

        if (update || !expected) {
            continue; // --update 或新样例：仅记录
        }
        if (JSON.stringify(expected) === JSON.stringify(actual)) {
            passed++;
        } else {
            failed++;
            failures.push({ rel, expected, actual });
        }
    }

    if (update) {
        fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
        fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(next, null, 2) + '\n');
        console.error(`基线已更新: ${SNAPSHOT_FILE}（${samples.length} 个样例）`);
        return;
    }

    console.error('='.repeat(70));
    console.error(`WMF/EMF/EMF+ 快照测试（${samples.length} 个样例）`);
    console.error('='.repeat(70));

    if (update) {
        fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(next, null, 2) + '\n');
        console.error(`基线已更新: ${SNAPSHOT_FILE}（${samples.length} 个样例）`);
        return;
    }

    const added = samples.filter((rel) => !baseline[rel]).length;
    const removed = Object.keys(baseline).filter((rel) => !next[rel]).length;

    for (const f of failures.slice(0, 20)) {
        console.error(`✗ ${f.rel}`);
        console.error(`    期望: ${JSON.stringify(f.expected)}`);
        console.error(`    实际: ${JSON.stringify(f.actual)}`);
    }
    if (failures.length > 20) {
        console.error(`... 以及另外 ${failures.length - 20} 个失败`);
    }

    if (added > 0) console.error(`+ ${added} 个新样例已纳入（本次记录基线）`);
    if (removed > 0) console.error(`- ${removed} 个样例已移除`);

    console.error('='.repeat(70));
    console.error(`结果: ${passed} 通过, ${failed} 失败`);
    console.error('='.repeat(70));
    if (failed > 0) {
        console.error('渲染行为发生变化。若为有意变更，请运行: npm run test:snapshot:update');
    }
    process.exit(failed > 0 ? 1 : 0);
}

main();
