/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  // transform: {
  //   '\\.[jt]sx?$': ['esbuild-jest']
  // },
  maxWorkers: 1,
  transformIgnorePatterns: []
};

export default config;
