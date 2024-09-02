const jsdoc = require('eslint-plugin-jsdoc');
const tsEslint = require('typescript-eslint');

module.exports = tsEslint.config({
  name: 'additional js rules',
  files: ['**/*.js'],
  plugins: {
    jsdoc
  },
  rules: {
    'react/prop-types': 'off'
  }
});
