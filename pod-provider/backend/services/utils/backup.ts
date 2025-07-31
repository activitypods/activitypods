import path from 'path';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import BackupService from '@semapps/backup';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
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
} satisfies ServiceSchema;

export default ServiceSchema;
