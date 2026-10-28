// The package is CommonJS with `exports.default`, which NodeNext resolves to the whole module from ESM
declare module 'wait-for-expect' {
  const waitForExpect: {
    (expectation: () => void | Promise<void>, timeout?: number, interval?: number): Promise<{}>;
    defaults: { timeout: number; interval: number };
  };
  export default waitForExpect;
}
