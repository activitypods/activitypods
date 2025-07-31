// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from './config.ts';

export default {
  host: CONFIG.SMTP_HOST,
  port: CONFIG.SMTP_PORT,
  secure: CONFIG.SMTP_SECURE,
  auth: {
    user: CONFIG.SMTP_USER,
    pass: CONFIG.SMTP_PASS
  }
};
