const CONFIG = require('./config');

// See https://nodemailer.com/transports/ for other kind of Nodemailer transports

module.exports = {
  host: CONFIG.SMTP_HOST,
  port: CONFIG.SMTP_PORT,
  secure: CONFIG.SMTP_SECURE,
  auth: {
    user: CONFIG.SMTP_USER,
    pass: CONFIG.SMTP_PASS,
  },
};
