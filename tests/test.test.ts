// Log node versions
console.log(`Node version: ${process.version}`);

describe('test test', () => {
  const a = 'sdf' satisfies string;

  test('2+2=4', () => {
    expect(2 + 2).toBe(4);
  });
  test('string a to be sdf', () => {
    expect(a).toBe('sdf');
  });
});
