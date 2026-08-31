module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.3' } },
  plugins: ['react-refresh', '@typescript-eslint'],
  rules: {
    'react/jsx-no-target-blank': 'off',
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'react/prop-types': 'off',
    // Codebase convention: raw apostrophes in JSX copy text.
    'react/no-unescaped-entities': 'off',
    // Codebase convention: `any` is used liberally at API boundaries
    // (axios responses, socket payloads). Not worth mass-typing for lint.
    '@typescript-eslint/no-explicit-any': 'off',
    // Allow intentionally-unused args/vars when prefixed with underscore.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
  },
  overrides: [
    {
      // Context modules intentionally co-export a Provider component and
      // its consumer hook; fast-refresh granularity is acceptable there.
      files: ['src/contexts/**/*.{ts,tsx}'],
      rules: { 'react-refresh/only-export-components': 'off' },
    },
  ],
}
