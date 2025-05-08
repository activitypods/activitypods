/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {
    '\\.[jt]sx?$': ['babel-jest']
  },
  transformIgnorePatterns: []
};

module.exports = config;
