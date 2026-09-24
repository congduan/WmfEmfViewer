// ESLint 配置（ESLint 8 legacy 格式）。
// 范围：src/ + scripts/（见 package.json 的 lint 脚本）。
// 说明：本仓库源码混合 TS 扩展层与 CommonJS JS 引擎，故：
//   - 用 eslint:recommended 兜底通用问题（no-undef/no-empty/…）
//   - 用 @typescript-eslint/recommended 提供 TS 相关规则
//   - 关闭与既有约定冲突的规则（见下方注释）
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    rules: {
        // 核心 no-unused-vars 需关闭，改用 TS 感知版本，否则接口占位参数会误报
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_'
        }],

        // 日志：bundle 构建期会把 console.log 改写成门控函数，源码照写即可
        'no-console': 'off',

        // JS 引擎依赖大量 any 与 JSDoc 类型断言，不作为问题
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/ban-ts-comment': 'off',
        // 源码为 CommonJS（由 esbuild 打包），require 是唯一模块语法
        '@typescript-eslint/no-var-requires': 'off',
        // baseDrawer 中保留的空实现是有意的记录处理器占位
        '@typescript-eslint/no-empty-function': 'off',
        // 允许显式抛非 Error（解析器为控制流程也会 throw 字符串/数字）
        'no-throw-literal': 'off'
    },
    env: {
        node: true,
        browser: true,
        es2021: true // 解析器/绘制器大量使用 globalThis（__WMF_DEBUG__ 门控）
    },
    overrides: [
        {
            // 生成器脚本（make-compare-html / make-docx 等）会在模板字面量里内嵌
            // 浏览器端 JS/CSS 文本，其中的 `\\.` 是输出端转义所必需，
            // 但 no-useless-escape 会把模板字面量里的 `\\` 误判为多余转义。
            files: ['scripts/*.js'],
            rules: {
                'no-useless-escape': 'off'
            }
        }
    ],
    ignorePatterns: [
        'out/',
        'node_modules/',
        'website/metafileParser.browser.js',
        'packages/wmf-emf-renderer/index.js'
    ]
};
