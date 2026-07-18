import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const noUnusedVars = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
}

export default defineConfig([
  globalIgnores(['dist', 'dist-server', 'coverage', 'node_modules', '*.tsbuildinfo']),
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...noUnusedVars,
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['server/**/*.ts', '*.config.{js,ts}', 'eslint.config.js'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
        fetch: 'readonly',
        Headers: 'readonly',
        ReadableStream: 'readonly',
      },
    },
    rules: noUnusedVars,
  },
])
