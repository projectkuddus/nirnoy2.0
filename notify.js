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
// --- Nirnoy booking notifications (stub) ---

/**
 * Notify patient that a booking was created.
 * In production, wire this to SMS/email.
 */
module.exports.patientBookingCreated = async function ({ patient, doctor, clinic, appointment }) {
  try {
    console.log('[NOTIFY] patientBookingCreated', {
      patient_email: patient && patient.email,
      doctor_name: doctor && doctor.name,
      clinic_name: clinic && clinic.name,
      appt_date: appointment && appointment.appt_date,
      slot_time: appointment && appointment.slot_time
    });
  } catch (err) {
    console.error('Error in patientBookingCreated stub', err);
  }
};

/**
 * Notify doctor that a patient booked an appointment.
 */
module.exports.doctorBookingCreated = async function ({ patient, doctor, clinic, appointment }) {
  try {
    console.log('[NOTIFY] doctorBookingCreated', {
      doctor_email: doctor && doctor.email,
      patient_name: patient && patient.name,
      clinic_name: clinic && clinic.name,
      appt_date: appointment && appointment.appt_date,
      slot_time: appointment && appointment.slot_time
    });
  } catch (err) {
    console.error('Error in doctorBookingCreated stub', err);
  }
};

/**
 * Notify patient that an appointment was rescheduled.
 */
module.exports.patientBookingRescheduled = async function ({ patient, doctor, clinic, oldAppointment, newAppointment }) {
  try {
    console.log('[NOTIFY] patientBookingRescheduled', {
      patient_email: patient && patient.email,
      doctor_name: doctor && doctor.name,
      old_date: oldAppointment && oldAppointment.appt_date,
      old_time: oldAppointment && oldAppointment.slot_time,
      new_date: newAppointment && newAppointment.appt_date,
      new_time: newAppointment && newAppointment.slot_time
    });
  } catch (err) {
    console.error('Error in patientBookingRescheduled stub', err);
  }
};

/**
 * Notify doctor that an appointment was rescheduled by patient.
 */
module.exports.doctorBookingRescheduled = async function ({ patient, doctor, clinic, oldAppointment, newAppointment }) {
  try {
    console.log('[NOTIFY] doctorBookingRescheduled', {
      doctor_email: doctor && doctor.email,
      patient_name: patient && patient.name,
      old_date: oldAppointment && oldAppointment.appt_date,
      old_time: oldAppointment && oldAppointment.slot_time,
      new_date: newAppointment && newAppointment.appt_date,
      new_time: newAppointment && newAppointment.slot_time
    });
  } catch (err) {
    console.error('Error in doctorBookingRescheduled stub', err);
  }
};
// --- Nirnoy cancellation notifications (stub) ---

/**
 * Notify patient that an appointment has been cancelled.
 * `initiator` is either "patient" or "doctor".
 */
module.exports.patientBookingCancelled = async function ({
  initiator,
  patient,
  doctor,
  clinic,
  appointment
}) {
  try {
    console.log('[NOTIFY] patientBookingCancelled', {
      initiator,
      patient_email: patient && patient.email,
      doctor_name: doctor && doctor.name,
      clinic_name: clinic && clinic.name,
      appt_date: appointment && appointment.appt_date,
      slot_time: appointment && appointment.slot_time
    });
  } catch (err) {
    console.error('Error in patientBookingCancelled stub', err);
  }
};

/**
 * Notify doctor that an appointment has been cancelled.
 * `initiator` is either "patient" or "doctor".
 */
module.exports.doctorBookingCancelled = async function ({
  initiator,
  patient,
  doctor,
  clinic,
  appointment
}) {
  try {
    console.log('[NOTIFY] doctorBookingCancelled', {
      initiator,
      doctor_email: doctor && doctor.email,
      patient_name: patient && patient.name,
      clinic_name: clinic && clinic.name,
      appt_date: appointment && appointment.appt_date,
      slot_time: appointment && appointment.slot_time
    });
  } catch (err) {
    console.error('Error in doctorBookingCancelled stub', err);
  }
};
