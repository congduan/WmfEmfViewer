module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
    },
    plugins: ['@typescript-eslint'],
    rules: {
        'no-unused-vars': 'warn',
        'no-console': 'off'
    },
    env: {
        node: true,
        es6: true
    }
};