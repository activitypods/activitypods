const tsEslint = require('typescript-eslint');
const path = require('path');

const files = ['**/*.ts'];

module.exports = tsEslint.config(
  {
    files,
    languageOptions: {
      parser: tsEslint.parser,
      parserOptions: {
        project: path.join(__dirname, '../../tsconfig.json')
      }
    }
  },
  // Restrict typescript configs to ts files...
  ...[...tsEslint.configs.recommendedTypeChecked, ...tsEslint.configs.stylisticTypeChecked].map(config => ({
    ...config,
    files
  })),
  {
    name: 'additional ts rules',
    files,
    rules: {
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/consistent-type-exports': 'warn',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-confusing-void-expression': 'warn',
      '@typescript-eslint/no-duplicate-type-constituents': 'warn',
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-for-in-array': 'warn',
      '@typescript-eslint/no-implied-eval': 'off',
      '@typescript-eslint/no-meaningless-void-operator': 'warn',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-mixed-enums': 'warn',
      '@typescript-eslint/no-redundant-type-constituents': 'warn',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unnecessary-qualifier': 'warn',
      '@typescript-eslint/no-unnecessary-type-arguments': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'warn',
      '@typescript-eslint/prefer-includes': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/prefer-readonly': 'warn',
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
      '@typescript-eslint/prefer-reduce-type-parameter': 'warn',
      '@typescript-eslint/prefer-regexp-exec': 'warn',
      '@typescript-eslint/prefer-return-this-type': 'warn',
      '@typescript-eslint/prefer-string-starts-ends-with': 'warn',
      '@typescript-eslint/promise-function-async': 'warn',
      '@typescript-eslint/require-array-sort-compare': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'warn',
      '@typescript-eslint/triple-slash-reference': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      'array-callback-return': 'warn',
      'arrow-body-style': 'off',
      camelcase: 'warn',
      'class-methods-use-this': 'warn',
      'consistent-return': 'warn',
      'default-case': 'warn',
      'dot-notation': 'warn',
      eqeqeq: 'warn',
      'guard-for-in': 'warn',
      // 'import/extensions': 'off',
      // 'import/newline-after-import': 'warn',
      // 'import/no-cycle': 'warn',
      // 'import/no-duplicates': 'warn',
      // 'import/no-dynamic-require': 'off',
      // 'import/no-named-as-default': 'warn',
      // 'import/no-named-as-default-member': 'warn',
      // 'import/no-named-default': 'warn',
      // 'import/no-useless-path-segments': 'warn',
      // 'import/order': 'warn',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/tag-lines': 'off',
      'jsx-a11y/anchor-is-valid': 'off'
    }
  }
);
