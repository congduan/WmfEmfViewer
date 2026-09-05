// 构建 npm 库包（packages/wmf-emf-renderer）：
// 1. 从 src/ 复制核心解析/渲染模块到 packages/wmf-emf-renderer/src/
// 2. 修正 require 相对路径（原文件为拼接式 bundle 设计，Node 下无法直接解析）
// 3. 将 console.log 重定向到 globalThis.__wmfEmfRendererLog（库默认静默，可由 setDebugEnabled 开启）
// 4. 复制 LICENSE
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PKG_DIR = path.join(ROOT, 'packages', 'wmf-emf-renderer');
const PKG_SRC = path.join(PKG_DIR, 'src');

// 源文件 -> 包内路径（保持模块内部相对结构，便于 require 重写规则统一处理）
const FILES = [
    'src/utils/fileTypeDetector.js',
    'src/utils/coordinateTransformer.js',
    'src/utils/mathTypeMtefParser.js',
    'src/utils/gdiObjectManager.js',
    'src/modules/parsers/baseParser.js',
    'src/modules/parsers/wmfParser.js',
    'src/modules/parsers/emfParser.js',
    'src/modules/parsers/emfPlusParser.js',
    'src/modules/drawers/baseDrawer.js',
    'src/modules/drawers/wmfDrawer.js',
    'src/modules/drawers/emfDrawer.js',
    'src/modules/drawers/emfPlusDrawer.js',
    'src/modules/svgContext.js'
];

// 原文件中的 require 路径在 Node 下解析错误（它们原本只用于浏览器 bundle 拼接），
// 复制到包内相同目录结构后需要重写：
//   drawers/ 下：'../xxx'（原指向 src/modules/）与 '../utils/xxx' → '../../utils/xxx'
//   parsers/ 下的 './baseParser' 保持不变（目录结构一致）
const REQUIRE_REWRITES = [
    { from: /require\('\.\.\/coordinateTransformer'\)/g, to: "require('../../utils/coordinateTransformer')" },
    { from: /require\('\.\.\/gdiObjectManager'\)/g, to: "require('../../utils/gdiObjectManager')" },
    { from: /require\('\.\.\/utils\/mathTypeMtefParser'\)/g, to: "require('../../utils/mathTypeMtefParser')" }
];

function transform(content) {
    // 静默调试日志：库内部日志走全局开关（index.js 提供 setDebugEnabled）
    content = content.replace(/\bconsole\.log\(/g, 'globalThis.__wmfEmfRendererLog(');
    for (const rule of REQUIRE_REWRITES) {
        content = content.replace(rule.from, rule.to);
    }
    return content;
}

function build() {
    console.log('构建 npm 库包...');

    // 清空旧的包 src 目录，确保无残留
    fs.rmSync(PKG_SRC, { recursive: true, force: true });

    let count = 0;
    for (const relPath of FILES) {
        const srcPath = path.join(ROOT, relPath);
        const destPath = path.join(PKG_SRC, path.relative('src', relPath));
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const content = transform(fs.readFileSync(srcPath, 'utf8'));
        fs.writeFileSync(destPath, content);
        count++;
        console.log('  +', path.relative(PKG_DIR, destPath));
    }

    // 复制 LICENSE
    const licenseSrc = path.join(ROOT, 'LICENSE');
    if (fs.existsSync(licenseSrc)) {
        fs.copyFileSync(licenseSrc, path.join(PKG_DIR, 'LICENSE'));
        console.log('  + LICENSE');
    }

    console.log(`完成：共处理 ${count} 个模块文件，输出到 ${path.relative(ROOT, PKG_SRC)}/`);
}

if (require.main === module) {
    build();
}

module.exports = build;
