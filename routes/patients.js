const express = require('express');
const { all, get } = require('../db');

const router = express.Router();

const requirePatient = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'patient') {
    return res.status(403).send('Patient access required.');
  }
  next();
};

router.get('/dashboard/patient', requirePatient, async (req, res) => {
  try {
    const appointments = await all(
      `SELECT a.*, u.name as doctor_name, c.prescription_text, c.tasks_json
       FROM appointments a
       JOIN users u ON a.doctor_id = u.id
       LEFT JOIN consultations c ON c.appointment_id = a.id
       WHERE a.patient_id = ?
       ORDER BY a.date DESC, a.serial_no DESC`,
      [req.session.user.id]
    );
    const enriched = appointments.map((appt) => ({
      ...appt,
      tasks: appt.tasks_json ? JSON.parse(appt.tasks_json) : null,
    }));
    res.render('dashboard_patient', { appointments: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load patient dashboard.');
  }
});

router.get('/appointments/:id/detail', requirePatient, async (req, res) => {
  try {
    const appointment = await get(
      `SELECT a.*, u.name as doctor_name
       FROM appointments a
       JOIN users u ON a.doctor_id = u.id
       WHERE a.id = ? AND a.patient_id = ?`,
      [req.params.id, req.session.user.id]
    );
    if (!appointment) {
      return res.status(404).send('Appointment not found.');
    }
    const answersRow = await get(
      `SELECT answers_json FROM appointment_answers WHERE appointment_id = ?`,
      [appointment.id]
    );
    const consultation = await get(
      `SELECT notes, prescription_text, tasks_json
       FROM consultations WHERE appointment_id = ?`,
      [appointment.id]
    );
    res.render('appointment_detail', {
      appointment,
      answers: answersRow ? JSON.parse(answersRow.answers_json) : null,
      consultation: consultation
        ? {
            ...consultation,
            tasks: consultation.tasks_json ? JSON.parse(consultation.tasks_json) : null,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load appointment.');
  }
});

module.exports = router;
