const express = require('express');
const { all, get, run } = require('../db');

const router = express.Router();
const requireDoctor = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'doctor') {
    return res.status(403).send('Doctor access required.');
  }
  next();
};

router.get('/doctors', async (req, res) => {
  try {
    const doctors = await all(
      `SELECT u.id as user_id, u.name, u.email, d.specialty, d.chamber
       FROM users u
       JOIN doctors d ON u.id = d.user_id
       WHERE u.role = 'doctor' AND u.status = 'approved'
       ORDER BY u.name`
    );
    res.render('doctors_list', { doctors });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load doctors.');
  }
});

router.get('/doctors/:id', async (req, res) => {
  try {
    const doctor = await get(
      `SELECT u.id as user_id, u.name, u.email, u.status, d.specialty, d.chamber, d.visit_duration_minutes
       FROM users u
       JOIN doctors d ON u.id = d.user_id
       WHERE u.id = ?`,
      [req.params.id]
    );
    if (!doctor || doctor.status !== 'approved') {
      return res.status(404).send('Doctor not found.');
    }
    res.render('doctor_detail', { doctor });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load doctor.');
  }
});

router.get('/dashboard/doctor', requireDoctor, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const appointments = await all(
      `SELECT a.*, u.name as patient_name, aa.answers_json, c.notes, c.prescription_text, c.tasks_json
       FROM appointments a
       JOIN users u ON a.patient_id = u.id
       LEFT JOIN appointment_answers aa ON aa.appointment_id = a.id
       LEFT JOIN consultations c ON c.appointment_id = a.id
       WHERE a.doctor_id = ? AND a.date = ?
       ORDER BY a.serial_no`,
      [req.session.user.id, today]
    );
    const parsed = appointments.map((appt) => ({
      ...appt,
      answers: appt.answers_json ? JSON.parse(appt.answers_json) : null,
      tasks: appt.tasks_json ? JSON.parse(appt.tasks_json) : null,
    }));
    res.render('dashboard_doctor', { appointments: parsed, today });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load dashboard.');
  }
});

const updateStatus = async (appointmentId, doctorId, status) => {
  const appointment = await get(
    `SELECT id FROM appointments WHERE id = ? AND doctor_id = ?`,
    [appointmentId, doctorId]
  );
  if (!appointment) {
    throw new Error('Appointment not found.');
  }
  await run(`UPDATE appointments SET status = ? WHERE id = ?`, [status, appointmentId]);
};

router.post('/doctor/appointments/:id/arrived', requireDoctor, async (req, res) => {
  try {
    await updateStatus(req.params.id, req.session.user.id, 'arrived');
    res.redirect('/dashboard/doctor');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update status.');
  }
});

router.post('/doctor/appointments/:id/waiting', requireDoctor, async (req, res) => {
  try {
    await updateStatus(req.params.id, req.session.user.id, 'waiting');
    res.redirect('/dashboard/doctor');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update status.');
  }
});

router.post(
  '/doctor/appointments/:id/start',
  requireDoctor,
  async (req, res) => {
    try {
      await updateStatus(req.params.id, req.session.user.id, 'in_consultation');
      res.redirect('/dashboard/doctor');
    } catch (err) {
      console.error(err);
      res.status(500).send('Failed to update status.');
    }
  }
);

router.post(
  '/doctor/appointments/:id/no-show',
  requireDoctor,
  async (req, res) => {
    try {
      await updateStatus(req.params.id, req.session.user.id, 'no_show');
      res.redirect('/dashboard/doctor');
    } catch (err) {
      console.error(err);
      res.status(500).send('Failed to update status.');
    }
  }
);

router.post(
  '/doctor/appointments/:id/complete',
  requireDoctor,
  async (req, res) => {
    try {
      const appointment = await get(
        `SELECT id FROM appointments WHERE id = ? AND doctor_id = ?`,
        [req.params.id, req.session.user.id]
      );
      if (!appointment) {
        return res.status(404).send('Appointment not found.');
      }
      await run(`UPDATE appointments SET status = 'completed' WHERE id = ?`, [
        appointment.id,
      ]);
      const tasksJson = JSON.stringify({ tasks: req.body.tasks || '' });
      const existing = await get(
        `SELECT id FROM consultations WHERE appointment_id = ?`,
        [appointment.id]
      );
      if (existing) {
        await run(
          `UPDATE consultations
             SET notes = ?, prescription_text = ?, tasks_json = ?
           WHERE appointment_id = ?`,
          [req.body.notes || '', req.body.prescription_text || '', tasksJson, appointment.id]
        );
      } else {
        await run(
          `INSERT INTO consultations (appointment_id, notes, prescription_text, tasks_json)
           VALUES (?, ?, ?, ?)`,
          [appointment.id, req.body.notes || '', req.body.prescription_text || '', tasksJson]
        );
      }
      res.redirect('/dashboard/doctor');
    } catch (err) {
      console.error(err);
      res.status(500).send('Failed to finalize appointment.');
    }
  }
);

module.exports = router;
