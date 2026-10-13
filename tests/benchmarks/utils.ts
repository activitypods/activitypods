import { Console } from 'console';
import { performance } from 'perf_hooks';

// Jest decorates console.log with the location of the call, write directly to stdout instead
const out = new Console({ stdout: process.stdout, stderr: process.stderr });

/** Read a numeric setting from an environment variable (e.g. BENCH_NUM_RESOURCES=500 yarn run bench) */
export const envNumber = (name: string, defaultValue: number) =>
  process.env[name] ? parseInt(process.env[name], 10) : defaultValue;

export const NUM_RUNS = envNumber('BENCH_RUNS', 3);

/** Run the given async functions with a maximum concurrency */
export const runWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<any>
) => {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
};

/** Time an async function and return its result with the duration in ms */
export const time = async <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
  const start = performance.now();
  const result = await fn();
  return { result, duration: performance.now() - start };
};

const round = (n: number) => Math.round(n);

/**
 * Collect measures and print them as a table at the end of the suite.
 * Each measure is run NUM_RUNS times; min, median and max are reported (in ms).
 */
export class BenchmarkReport {
  rows: Record<string, any>[] = [];

  constructor(public title: string) {}

  async measure(label: string, fn: () => Promise<any>, extra: (result: any) => Record<string, any> = () => ({})) {
    const durations = [];
    let lastResult;
    for (let i = 0; i < NUM_RUNS; i++) {
      const { result, duration } = await time(fn);
      durations.push(duration);
      lastResult = result;
    }
    durations.sort((a, b) => a - b);
    const row = {
      measure: label,
      min: round(durations[0]),
      median: round(durations[Math.floor(durations.length / 2)]),
      max: round(durations[durations.length - 1]),
      ...extra(lastResult)
    };
    this.rows.push(row);
    // Print each measure as it comes, as a full run may take a while
    out.log(`[${this.title}] ${JSON.stringify(row)}`);
    return lastResult;
  }

  print() {
    out.log(`\n${this.title} (${NUM_RUNS} runs, durations in ms)`);
    out.table(this.rows);
  }
}
