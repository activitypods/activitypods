const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'benchmarkQuery',
  actions: {
    /**
     * Compares execution time between while sorting a activitypub collection using DateTime (as:published) and timestamp (as:publishedTimestamp)
     * Persists result in backend/benchmark folder
     * e.g. from moleculer console
     * call benchmarkQuery.benchmark
     *    --collectionUri "http://localhost:3000/sylvain/outbox"
     *    --iterations 100
     *    --webId "anon"
     *    --usePrefix true
     */
    async benchmark(ctx) {
      const { collectionUri, iterations, webId, usePrefix } = ctx.params;
      ctx.meta.dataset = 'sylvain';

      if (!collectionUri || !iterations || !webId) {
        throw new Error('Parameters collectionUri, iterations and webId are mandatory.');
      }

      this.logger.info(`Starting benchmark of ${collectionUri} with ${iterations} iterations...`);

      const prefix = usePrefix
        ? 'as:'
        : 'https://www.w3.org/ns/activitystreams#';

      const sortPredicatePublished = `${usePrefix ? '':'<'}${prefix}published${usePrefix ? '':'>'}`;
      const sortPredicatePublishedTimestamp = `${usePrefix ? '':'<'}${prefix}publishedTimestamp${usePrefix ? '':'>'}`;

      const metricsPublishedAsc = await this.runBenchmark(ctx, collectionUri, iterations, sortPredicatePublished, webId, 'ASC' );

      const metricsPublishedDesc = await this.runBenchmark(ctx, collectionUri, iterations, sortPredicatePublished, webId, 'DESC' );
      const metricsPublishedTimestampAsc = await this.runBenchmark(ctx, collectionUri, iterations, sortPredicatePublishedTimestamp, webId, 'ASC');
      const metricsPublishedTimestampDesc = await this.runBenchmark(ctx, collectionUri, iterations, sortPredicatePublishedTimestamp, webId, 'DESC');

      const outputFile = path.join(__dirname, `../benchmark/benchmark_comparison_${Date.now()}.json`);
      const results = {
        collectionUri,
        iterations,
        metrics: {
          publishedAsc: metricsPublishedAsc,
          publishedDesc: metricsPublishedDesc,
          publishedTimestampAsc: metricsPublishedTimestampAsc,
          publishedTimestampDesc: metricsPublishedTimestampDesc
        }
      };
      fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

      this.logger.info(`Benchmark finished. Result stored in ${outputFile}`);
      return results;
    }
  },
  methods: {
    async runBenchmark(ctx, collectionUri, iterations, sortPredicate, webId, sortOrder) {
      const times = [];
      for (let i = 0; i < iterations; i++) {
        let results;
        const start = process.hrtime();

        try {
          const query = `
          PREFIX as: <https://www.w3.org/ns/activitystreams#>
          SELECT DISTINCT ?itemUri ?order
          WHERE {
            <${collectionUri}> a as:Collection .
            OPTIONAL { 
              <${collectionUri}> as:items ?itemUri . 
              OPTIONAL { ?itemUri ${sortPredicate} ?order . }
            }
          }
          ORDER BY ${sortOrder}(?order)
        `;
          this.logger.info('Using this query',query);

          results = await ctx.call('triplestore.query', {
              query: query,
              accept: 'application/json',
              webId
            }
          );

          const orders = results.map(result => result.order?.value).filter(order => order !== undefined);
          const isSorted = this.verifySorting(orders, sortOrder);
          if (isSorted) {
            this.logger.info(`The results for ${sortPredicate} (${sortOrder}) are sorted correctly in iteration ${i + 1}.`);
          } else {
            this.logger.warn(
              `WARNING: The results for ${sortPredicate} (${sortOrder}) are not sorted correctly in iteration ${i + 1}.`
            );
          }

        } catch (error) {
          this.logger.error(`Error on query (${sortPredicate}), iteration ${i + 1} :`, error.message);
          // throw error;
          continue;
        }

        const end = process.hrtime(start);
        const timeMs = end[0] * 1000 + end[1] / 1e6; // Convertir en millisecondes
        times.push(timeMs);

        this.logger.info(`Iteration ${i + 1} (${sortPredicate}) done in ${timeMs.toFixed(2)} ms`);
      }

      return this.calculateMetrics(times);
    },

    calculateMetrics(times) {
      if (times.length === 0) return { mean: 0, max: 0, min: 0, stddev: 0 };

      const mean = times.reduce((a, b) => a + b, 0) / times.length;
      const max = Math.max(...times);
      const min = Math.min(...times);
      const variance = times.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / times.length;
      const stddev = Math.sqrt(variance);

      return { mean, max, min, stddev };
    },
    verifySorting(values, sortOrder) {
      if (values.length <= 1) return true; // Aucun tri nécessaire pour 0 ou 1 élément

      for (let i = 1; i < values.length; i++) {
        if (sortOrder === 'ASC' && values[i - 1] > values[i]) {
          return false;
        }
        if (sortOrder === 'DESC' && values[i - 1] < values[i]) {
          return false;
        }
      }
      return true;
    },
  }
};
