/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  transform: {
    '\\.[jt]sx?$': ['esbuild-jest']
  },
  transform: {},
  transformIgnorePatterns: []
};

export default config;
