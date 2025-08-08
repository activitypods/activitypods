import * as CONFIG from './config.ts';

// See https://nodemailer.com/transports/ for other kind of Nodemailer transports

export default {
  host: CONFIG.SMTP_HOST,
  port: CONFIG.SMTP_PORT,
  secure: CONFIG.SMTP_SECURE,
  auth: {
    user: CONFIG.SMTP_USER,
    pass: CONFIG.SMTP_PASS
  }
};
