import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'uploads/**'],
  },
  eslint.configs.recommended,
  {
    files: [tseslint.globs.ts],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  prettier,
  {
    files: [tseslint.globs.ts],
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/domain', from: './src/application' },
            { target: './src/domain', from: './src/infrastructure' },
            { target: './src/domain', from: './src/http' },
            { target: './src/application', from: './src/infrastructure' },
            { target: './src/application', from: './src/http' },
            { target: './src/infrastructure', from: './src/http' },
            { target: './src/http', from: './src/infrastructure' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['express', 'zod', 'pino', 'pino-http'],
              message: 'Domain and application code stays framework-free.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Inject Clock instead of calling Date.now().',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Inject Clock instead of calling new Date().',
        },
        {
          selector:
            "CallExpression[callee.object.name='crypto'][callee.property.name='randomUUID']",
          message: 'Inject IdGenerator instead of calling crypto.randomUUID().',
        },
      ],
    },
  },
);
