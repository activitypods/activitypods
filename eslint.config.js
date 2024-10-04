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
    languageOptions: { globals: { ...globals.commonjs, CONFIG: true, process: false } },
    rules: {
      'array-callback-return': 'warn',
      'arrow-body-style': 'off',
      camelcase: 'warn',
      'class-methods-use-this': 'warn',
      'consistent-return': 'warn',
      'default-case': 'off',
      'dot-notation': 'warn',
      eqeqeq: 'warn',
      'global-require': 'warn',
      'guard-for-in': 'warn',
      'import/extensions': 'warn',
      'import/newline-after-import': 'warn',
      'import/no-cycle': 'warn',
      'import/no-duplicates': 'warn',
      'import/no-dynamic-require': 'off',
      'import/no-named-default': 'warn',
      'import/no-unresolved': 'warn',
      'import/no-useless-path-segments': 'warn',
      'import/order': 'warn',
      'jest/no-conditional-expect': 'warn',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'no-await-in-loop': 'off',
      'no-case-declarations': 'warn',
      'no-continue': 'off',
      'no-else-return': 'off',
      'no-lonely-if': 'off',
      'no-loop-func': 'warn',
      'no-nested-ternary': 'warn',
      'no-new': 'warn',
      'no-param-reassign': 'warn',
      'no-plusplus': 'warn',
      'no-promise-executor-return': 'warn',
      'no-restricted-globals': 'warn',
      'no-restricted-syntax': 'off',
      'no-return-assign': 'warn',
      'no-return-await': 'off',
      'no-shadow': 'warn',
      'no-undef-init': 'off',
      'no-underscore-dangle': 'off',
      'no-unsafe-optional-chaining': 'warn',
      'no-unused-expressions': 'warn',
      'no-unused-vars': 'warn',
      'no-use-before-define': 'warn',
      'no-var': 'warn',
      'node/no-unsupported-features/es-syntax': 'off',
      'object-shorthand': 'off',
      'one-var': 'warn',
      'operator-assignment': 'warn',
      'prefer-arrow-callback': 'warn',
      'prefer-const': 'off',
      'prefer-destructuring': 'warn',
      'prefer-numeric-literals': 'warn',
      'prefer-promise-reject-errors': 'warn',
      'prefer-regex-literals': 'off',
      'prefer-template': 'warn',
      radix: 'off',
      'spaced-comment': 'warn',
      'vars-on-top': 'warn'
    }
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
    files: ['pod-provider/frontend/**']
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
