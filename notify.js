/**
 * notify.js
 *
 * Dev-only notification helpers.
 * In production we can later swap these out for real providers.
 */

function sendEmail(to, subject, body) {
  console.log('--- EMAIL (DEV STUB) ---');
  console.log('To:     ', to);
  console.log('Subject:', subject);
  console.log('Body:');
  console.log(body);
  console.log('------------------------');
}

function sendSMS(to, message) {
  console.log('--- SMS (DEV STUB) ---');
  console.log('To:     ', to);
  console.log('Message:', message);
  console.log('----------------------');
}

/**
 * Convenience helper for new appointment bookings.
 * "info" is a plain object with whatever we have handy.
 */
function notifyAppointmentBooked(info) {
  console.log('=== APPOINTMENT BOOKED (DEV STUB) ===');
  console.log(JSON.stringify(info, null, 2));
  console.log('=====================================');
}

module.exports = {
  sendEmail,
  sendSMS,
  notifyAppointmentBooked
};
