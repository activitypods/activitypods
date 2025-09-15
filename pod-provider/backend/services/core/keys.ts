import path from 'path';
import { KeysService } from '@semapps/crypto';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "keys"; settings: { podProvider: boo... Remove this comment to see the full error message
  mixins: [KeysService],
  settings: {
    podProvider: true
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
