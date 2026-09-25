import { ProxyService } from '@semapps/crypto';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "signature.proxy"; settings: { podPr... Remove this comment to see the full error message
  mixins: [ProxyService],
  settings: {
    podProvider: true
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
