/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/strict'],
  parser: '@typescript-eslint/parser',
  parserOptions: { project: './tsconfig.json' },
  plugins: ['@typescript-eslint'],
  env: { node: true, es2022: true },
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'no-eval': 'error',
    'no-new-func': 'error',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  ignorePatterns: ['dist/**', 'node_modules/**', 'drizzle.config.ts', '*.config.ts'],
};
