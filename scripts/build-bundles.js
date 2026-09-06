// 统一构建脚本：一份 src/ 源码，esbuild 同时产出
//   1) out/metafileParser.browser.js —— WebView / 网站用的 IIFE bundle
//   2) packages/wmf-emf-renderer/index.js —— npm 包单文件 CommonJS 产物
// 取代旧的「正则删除 require 再拼接」(build-browser-bundle.js) 与
// 「复制 + 正则重写」(build-npm-lib.js) 两套字符串变换构建。
//
// 日志静默通过编译期 define 完成（console.log -> 门控函数），
// 不会误伤字符串字面量或注释，与源码书写方式解耦。
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'out');
const WEBSITE_DIR = path.join(ROOT, 'website');

// 浏览器 bundle 头部：__wlog 静默日志门控（globalThis.__WMF_DEBUG__ = true 恢复），
// 行为与旧拼接式 bundle 一致；banner 不经过 define，内部可安全使用真实 console.log。
const BROWSER_BANNER = `// WMF/EMF/EMF+解析器和绘制器 - 浏览器兼容版本（esbuild 自动生成）
if (typeof globalThis.__WMF_DEBUG__ === 'undefined') {
  globalThis.__WMF_DEBUG__ = false;
}
function __wlog() {
  if (globalThis.__WMF_DEBUG__ === true) {
    console.log.apply(console, arguments);
  }
}
`;

async function buildBrowserBundle() {
    const outfile = path.join(OUT_DIR, 'metafileParser.browser.js');
    await esbuild.build({
        entryPoints: [path.join(ROOT, 'src', 'browser.js')],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['es2020'],
        outfile,
        banner: { js: BROWSER_BANNER },
        define: {
            'console.log': '__wlog' // 编译期替换：不影响字符串/注释，console.error/warn 保留
        },
        legalComments: 'none',
        logLevel: 'info'
    });

    // 同步一份到 website 目录（静态网站部署用，与旧构建行为一致）
    if (fs.existsSync(WEBSITE_DIR)) {
        fs.copyFileSync(outfile, path.join(WEBSITE_DIR, 'metafileParser.browser.js'));
        console.log('静态网站 bundle 已生成：', path.join(WEBSITE_DIR, 'metafileParser.browser.js'));
    }
    console.log('浏览器 bundle 已生成：', outfile);
}

async function buildNpmPackage() {
    const pkgDir = path.join(ROOT, 'packages', 'wmf-emf-renderer');
    const outfile = path.join(pkgDir, 'index.js');
    await esbuild.build({
        entryPoints: [path.join(pkgDir, 'entry.js')],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        target: ['node14'],
        outfile,
        define: {
            // 库默认静默；宿主通过 setDebugEnabled(true) 开启
            'console.log': '__wmfEmfRendererLog'
        },
        legalComments: 'none',
        logLevel: 'info'
    });
    console.log('npm 包产物已生成：', outfile);
}

async function main() {
    const only = process.argv[2]; // 可选：browser | npm，缺省全部构建
    if (!only || only === 'browser') await buildBrowserBundle();
    if (!only || only === 'npm') await buildNpmPackage();
}

// esbuild 的 context API 需要 Node 14+；直接执行（与旧脚本习惯一致）
main().catch((err) => {
    console.error('构建失败:', err);
    process.exit(1);
});
