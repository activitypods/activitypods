const eslintJs = require('@eslint/js');
const prettier = require('eslint-plugin-prettier');
const tsEslint = require('typescript-eslint');
// const eslintJest = require('eslint-plugin-jest');
const eslintTsRules = require('./config/eslint/ts-rules');
const eslintJsRules = require('./config/eslint/js-rules');
const eslintReactRules = require('./config/eslint/react-rules');
const eslintGeneralRules = require('./config/eslint/general-rules');
const globals = require('globals');

module.exports = tsEslint.config(
  // Ignore
  {
    ignores: ['**/dist/*', 'pod-provider/data/**']
  },
  // Globals
  {
    languageOptions: { globals: { ...globals.commonjs, CONFIG: true, process: false } }
  },
  // Node globals
  {
    files: ['app-framework/app/**', 'pod-provider/backend/**', 'tests/**', 'conf/*'],
    languageOptions: { globals: { ...globals.node } }
  },
  // Rules
  eslintJs.configs.recommended,
  ...eslintReactRules,
  ...eslintGeneralRules,
  ...eslintTsRules,
  ...eslintJsRules,
  {
    files: ['pod-provider/frontend/**', 'pod-provider/backend/**']
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
