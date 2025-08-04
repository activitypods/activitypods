import { arrayOf } from '@semapps/ldp';
const objectDepth = (o: any) => (Object(o) === o ? 1 + Math.max(-1, ...Object.values(o).map(objectDepth)) : 0);

const stream2buffer = (stream: any) => {
  return new Promise((resolve, reject) => {
    const _buf: any = [];
    stream.on('data', (chunk: any) => _buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(_buf)));
    stream.on('error', (err: any) => reject(err));
  });
};

// Return true if all elements of a1 can be found on a2. Order does not matter.
const arraysEqual = (a1: any, a2: any) =>
  arrayOf(a1).length === arrayOf(a2).length && arrayOf(a1).every((i: any) => arrayOf(a2).includes(i));

export { objectDepth, stream2buffer, arraysEqual };
