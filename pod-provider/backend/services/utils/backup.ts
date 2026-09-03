import path from 'path';
import BackupService from '@semapps/backup';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "backup"; settings: { localServer: {... Remove this comment to see the full error message
  mixins: [BackupService],
  settings: {
    localServer: {
      fusekiBase: CONFIG.FUSEKI_BASE,
      otherDirsPaths: {
        jwt: path.resolve(__dirname, '../../jwt'),
        uploads: path.resolve(__dirname, '../../uploads')
      }
    },
    copyMethod: CONFIG.BACKUP_COPY_METHOD,
    deleteFusekiBackupsAfterCopy: true,
    remoteServer: {
      path: CONFIG.BACKUP_SERVER_PATH,
      host: CONFIG.BACKUP_SERVER_HOST,
      user: process.env.SEMAPPS_BACKUP_SERVER_USER,
      password: process.env.SEMAPPS_BACKUP_SERVER_PASSWORD,
      port: process.env.SEMAPPS_BACKUP_SERVER_PORT
    },
    cronJob: {
      time: '0 0 4 * * *', // Every night at 4am
      timeZone: 'Europe/Paris'
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
