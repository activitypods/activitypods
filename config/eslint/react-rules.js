const globals = require('globals');
const tsEslint = require('typescript-eslint');
const eslintReact = require('eslint-plugin-react');
const eslintReactHooks = require('eslint-plugin-react-hooks');
const eslintA11y = require('eslint-plugin-jsx-a11y');
const path = require('path');

module.exports = tsEslint.config({
  name: 'react, react-hooks, jsx-a11y',
  files: ['{frontend,app-boilerplate}/**/*.{js,jsx,mjs,cjs,ts,tsx}'],
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
      project: path.join(__dirname, '../tsconfig.json'),
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
    'react/require-default-props': 'off',

    // TODO: Leave them out, once react eslint is properly updated to eslint v9.
    'react/destructuring-assignment': 'off',
    'react/no-unstable-nested-components': 'off',
    'react/jsx-no-undef': 'off',
    'react/destructuring-assignment': 'off',
    'react/no-array-index-key': 'off',
    'react/jsx-uses-react': 'off',
    'react/jsx-uses-vars': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/no-string-refs': 'off',
    'react/display-name': 'off',
    'react/no-direct-mutation-state': 'off',
    'react/require-render-return': 'off',
    'react/jsx-no-constructed-context-values': 'off',
    'react/no-danger-with-children': 'off',
    'react/jsx-fragments': 'off',
    'react/prop-types': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'react-hooks/rules-of-hooks': 'off'
  }
});
