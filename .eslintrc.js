module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
    },
    plugins: ['@typescript-eslint'],
    rules: {
        // '_' 前缀参数表示有意忽略（如 VSCode Provider 接口的占位参数）
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        'no-console': 'off'
    },
    env: {
        node: true,
        es6: true
    }
};
