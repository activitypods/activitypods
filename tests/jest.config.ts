/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    //  '\\.[jt]sx?$': ['esbuild-jest']
  },
  transformIgnorePatterns: []
};

export default config;
