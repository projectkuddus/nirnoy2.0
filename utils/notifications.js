const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'outbox.log');
function line(s){ fs.appendFileSync(OUT, `[${new Date().toISOString()}] ${s}\n`); }
async function sendEmail(to, subject, text){ line(`EMAIL to=${to} | subject="${subject}" | ${text}`); }
async function sendSMS(phone, text){ line(`SMS to=${phone||'N/A'} | ${text}`); }
module.exports = { sendEmail, sendSMS };
