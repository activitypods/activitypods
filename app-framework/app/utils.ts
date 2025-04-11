const { arrayOf } = require('@semapps/ldp');

const objectDepth = o => (Object(o) === o ? 1 + Math.max(-1, ...Object.values(o).map(objectDepth)) : 0);

const stream2buffer = stream => {
  return new Promise((resolve, reject) => {
    const _buf = [];
    stream.on('data', chunk => _buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(_buf)));
    stream.on('error', err => reject(err));
  });
};

// Return true if all elements of a1 can be found on a2. Order does not matter.
const arraysEqual = (a1, a2) =>
  arrayOf(a1).length === arrayOf(a2).length && arrayOf(a1).every(i => arrayOf(a2).includes(i));

module.exports = {
  objectDepth,
  stream2buffer,
  arraysEqual
};
