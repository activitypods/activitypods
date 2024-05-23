const eslintJs = require('@eslint/js');
const prettier = require('eslint-plugin-prettier');
const tsEslint = require('typescript-eslint');
// const eslintJest = require('eslint-plugin-jest');
const eslintTsRules = require('./conf/eslint-ts-rules');
const eslintJsRules = require('./conf/eslint-js-rules');
const eslintReactRules = require('./conf/eslint-react-rules');
const eslintGeneralRules = require('./conf/eslint-general-rules');
const globals = require('globals');

module.exports = tsEslint.config(
  // Ignore
  {
    ignores: ['**/dist/**', 'data/**']
  },
  // Globals
  {
    languageOptions: { globals: { ...globals.commonjs, process: false } }
  },
  // Node globals
  {
    files: ['packages/**', 'deploy/**', 'backend/**', 'tests/**', 'app-boilerplate/**', 'conf/*'],
    languageOptions: { globals: { ...globals.node } }
  },
  // Rules
  eslintJs.configs.recommended,
  ...eslintReactRules,
  ...eslintGeneralRules,
  ...eslintTsRules,
  ...eslintJsRules,
  {
    files: ['frontend/**']
  },
  // Tests
  {
    files: ['tests/**'],
    languageOptions: { globals: { ...globals.jest } },
    // plugins: { jest: eslintJest },
    rules: {
      // ...eslintJest.configs.recommended.rules,
      'global-require': 'off'
    }
  },
  // Prettier
  {
    plugins: {
      prettier
    }
  }
);
