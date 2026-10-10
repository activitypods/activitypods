const globals = require('globals');
const tsEslint = require('typescript-eslint');
const eslintReact = require('eslint-plugin-react');
const eslintReactHooks = require('eslint-plugin-react-hooks');
const eslintA11y = require('eslint-plugin-jsx-a11y');
const path = require('path');

module.exports = tsEslint.config({
  name: 'react, react-hooks, jsx-a11y',
  files: ['{frontend}/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
  plugins: {
    react: eslintReact,
    'react-hooks': eslintReactHooks,
    'jsx-a11y': eslintA11y
  },
  settings: {
    react: {
      version: 'detect'
    }
  },
  languageOptions: {
    parser: tsEslint.parser,
    parserOptions: {
      project: path.join(__dirname, '../../tsconfig.json'),
      ecmaFeatures: { jsx: true },
      sourceType: 'module'
    },
    globals: { ...globals.browser, ...globals.serviceworker }
  },
  rules: {
    ...eslintReactHooks.configs.recommended.rules,
    ...eslintA11y.configs.recommended.rules,

    'jsx-a11y/no-autofocus': 'warn',

    'react/button-has-type': 'warn',
    'react/destructuring-assignment': 'warn',
    'react/function-component-definition': 'off',
    'react/jsx-curly-brace-presence': 'warn',
    'react/jsx-filename-extension': 'off',
    'react/jsx-fragments': 'warn',
    'react/jsx-key': 'warn',
    'react/jsx-no-constructed-context-values': 'warn',
    'react/jsx-no-useless-fragment': 'warn',
    'react/jsx-props-no-spreading': 'off',
    'react/no-array-index-key': 'warn',
    'react/no-unstable-nested-components': 'warn',
    'react/prop-types': 'warn',
    'react/require-default-props': 'off'
  }
});
