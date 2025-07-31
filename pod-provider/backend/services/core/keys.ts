import path from 'path';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { KeysService } from '@semapps/crypto';

export default {
  mixins: [KeysService],
  settings: {
    podProvider: true
  }
};
