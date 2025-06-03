/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {
    '\\.[jt]sx?$': ['esbuild-jest']
  },
  transformIgnorePatterns: []
};

module.exports = config;
