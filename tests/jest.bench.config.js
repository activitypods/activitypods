/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/benchmarks/**/*.bench.ts'],
  maxWorkers: 1,
  transformIgnorePatterns: []
};

export default config;
