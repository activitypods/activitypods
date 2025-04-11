const jsdoc = require('eslint-plugin-jsdoc');
const tsEslint = require('typescript-eslint');
const { FlatCompat } = require('@eslint/eslintrc');
const eslintImport = require('eslint-plugin-import-x');
const compat = new FlatCompat({});

module.exports = tsEslint.config(
  // Import Plugin (needs to be in compat mode and ecma version is set manually).
  ...compat
    .config({
      ...eslintImport.configs.recommended,
      settings: {
        'import-x/parsers': {
          '@typescript-eslint/parser': ['.ts', '.tsx'],
          espree: ['.js', '.cjs', '.mjs', '.jsx']
        },
        'import-x/resolver': {
          typescript: true,
          node: true
        }
      }
    })
    .map(conf => ({
      ...conf,
      languageOptions: { parserOptions: { ecmaVersion: 'latest' } }
    })),
  // JS Doc
  {
    name: 'js doc',
    plugins: {
      jsdoc
    },
    rules: jsdoc.configs.recommended.rules
  },
  {
    name: 'custom rules and adjustments',
    rules: {
      'no-await-in-loop': 'warn',
      'no-bitwise': 'warn',
      'no-case-declarations': 'warn',
      'no-else-return': 'warn',
      'no-extra-boolean-cast': 'warn',
      'no-constant-condition': 'warn',
      'no-lonely-if': 'warn',
      'no-loop-func': 'warn',
      'no-nested-ternary': 'warn',
      'no-new': 'warn',
      'no-param-reassign': 'warn',
      'no-plusplus': 'warn',
      'no-promise-executor-return': 'warn',
      'no-restricted-globals': 'warn',
      'no-restricted-syntax': 'off',
      'no-return-assign': 'warn',
      'no-return-await': 'warn',
      'no-shadow': 'warn',
      'no-undef-init': 'off',
      'no-underscore-dangle': 'off',
      'no-unsafe-optional-chaining': 'warn',
      'no-unused-expressions': 'warn',
      'no-unused-vars': 'warn',
      'no-use-before-define': 'warn',
      'no-useless-return': 'warn',
      'no-var': 'warn',
      'object-shorthand': 'off',
      'one-var': 'off',
      'operator-assignment': 'warn',
      'prefer-arrow-callback': 'warn',
      'prefer-const': 'warn',
      'prefer-destructuring': 'warn',
      'prefer-numeric-literals': 'warn',
      'prefer-promise-reject-errors': 'warn',
      'prefer-regex-literals': 'warn',
      'prefer-template': 'warn',
      'spaced-comment': 'warn',
      'vars-on-top': 'warn',
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-unresolved': ['error', { commonjs: true, amd: true }]
    }
  }
);
