/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {
    '\\.[jt]sx?$': ['esbuild-jest', { sourcemap: true }]
  },
  transformIgnorePatterns: []
};

module.exports = config;
