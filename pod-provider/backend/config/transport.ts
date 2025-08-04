import CONFIG from './config.ts';

// See https://nodemailer.com/transports/ for other kind of Nodemailer transports

export const host = CONFIG.SMTP_HOST;

export const port = CONFIG.SMTP_PORT;
export const secure = CONFIG.SMTP_SECURE;

export const auth = {
  user: CONFIG.SMTP_USER,
  pass: CONFIG.SMTP_PASS
};
