#!/usr/bin/env node
// 清理构建/渲染产物。
//
//   node scripts/clean.js             # 清空 out/（等价 rm -rf out，跨平台）
//   node scripts/clean.js --render-only  # 只删本地渲染/对比产物，保留编译产物与 bundle
//
// 背景：调试脚本（render-one.js / regress-render.js / diff-emf.js …）会把渲染结果
// 写到 out/<批次名>/，长期累积可达数 GB。这些目录对构建无意义，故单独提供清理入口。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');

/** --render-only 时保留的编译产物（out/ 下与扩展运行相关的内容） */
const KEEP = new Set([
    'commands',
    'providers',
    'extension.js',
    'extension.js.map',
    'metafileParser.browser.js'
]);

function rmrf(target) {
    fs.rmSync(target, { recursive: true, force: true });
}

function main() {
    const renderOnly = process.argv.includes('--render-only');

    if (!renderOnly) {
        rmrf(OUT_DIR);
        console.log('已删除:', OUT_DIR);
        return;
    }

    if (!fs.existsSync(OUT_DIR)) {
        console.log('out/ 不存在，无需清理');
        return;
    }

    let removed = 0;
    let bytes = 0;
    for (const entry of fs.readdirSync(OUT_DIR, { withFileTypes: true })) {
        if (KEEP.has(entry.name)) continue;
        const target = path.join(OUT_DIR, entry.name);
        bytes += dirSize(target);
        rmrf(target);
        removed++;
    }
    console.log(`已清理 ${removed} 项渲染产物，释放约 ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

/** 递归统计体积（用于清理报告） */
function dirSize(target) {
    let total = 0;
    let stat;
    try {
        stat = fs.lstatSync(target);
    } catch {
        return 0;
    }
    if (stat.isFile()) return stat.size;
    if (!stat.isDirectory()) return 0;
    for (const name of fs.readdirSync(target)) {
        total += dirSize(path.join(target, name));
    }
    return total;
}

main();
