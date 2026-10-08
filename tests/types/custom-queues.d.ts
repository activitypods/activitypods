declare global {
  export namespace Moleculer {
    /** A job of a `moleculer-bull` queue. */
    interface QueueJob<Data = any> {
      id: string | number;
      data: Data;
      progress(value?: number): Promise<any>;
    }

    /** A queue handler, as declared in the `queues` property added by `moleculer-bull`. */
    interface QueueSchema {
      name?: string;
      concurrency?: number;
      process(job: QueueJob): any;
    }

    interface ServiceSchema {
      /** Job queues, handled by the `moleculer-bull` mixin. */
      queues?: Record<string, QueueSchema | QueueSchema['process']> & ThisType<Service>;
    }
  }
}

export {};
