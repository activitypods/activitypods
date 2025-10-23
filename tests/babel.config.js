export default {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'],
  plugins: ['@babel/transform-runtime', 'babel-plugin-transform-import-meta']
};
