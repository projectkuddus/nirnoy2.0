const express = require('express');
const { run, get, all } = require('../db');

const router = express.Router();

const renderNotice = (res, title, message, actions = []) => {
  res.render('notice', { title, message, actions });
};

const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

router.post('/appointments/book', requireLogin, async (req, res) => {
  const { doctor_id, date, slot_time, for_person_name } = req.body;
  if (!doctor_id || !date || !slot_time) {
    return res.render('error', { message: 'Missing booking information.' });
  }
  try {
    const doctor = await get(
      `SELECT u.id as user_id, u.status, u.name, d.visit_duration_minutes
       FROM users u
       JOIN doctors d ON u.id = d.user_id
       WHERE u.id = ?`,
      [doctor_id]
    );
    if (!doctor || doctor.status !== 'approved') {
      return res.render('error', { message: 'Doctor not available for booking.' });
    }
    const duplicate = await get(
      `SELECT id FROM appointments
       WHERE doctor_id = ? AND date = ? AND slot_time = ?
         AND status NOT IN ('cancelled','no_show')`,
      [doctor_id, date, slot_time]
    );
    if (duplicate) {
      return res.render('error', { message: 'Slot already booked. Choose another.' });
    }
    const serialRow = await get(
      `SELECT COUNT(*) as count FROM appointments
       WHERE doctor_id = ? AND date = ?
         AND status NOT IN ('cancelled','no_show')`,
      [doctor_id, date]
    );
    const serialNo = (serialRow?.count || 0) + 1;
    const createdAt = new Date().toISOString();
    const result = await run(
      `INSERT INTO appointments
        (doctor_id, patient_id, for_person_name, date, slot_time, serial_no, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'booked', ?)`,
      [
        doctor_id,
        req.session.user.id,
        for_person_name || req.session.user.name,
        date,
        slot_time,
        serialNo,
        createdAt,
      ]
    );
    res.redirect(`/appointments/${result.lastID}/confirm`);
  } catch (err) {
    console.error(err);
    res.render('error', { message: 'Failed to book appointment.' });
  }
});

router.get('/appointments/:id/confirm', requireLogin, async (req, res) => {
  try {
    const appointment = await get(
      `SELECT a.*, u.name as doctor_name, d.visit_duration_minutes
       FROM appointments a
       JOIN users u ON a.doctor_id = u.id
       JOIN doctors d ON d.user_id = u.id
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (
      !appointment ||
      (appointment.patient_id !== req.session.user.id &&
        req.session.user.role !== 'doctor' &&
        req.session.user.role !== 'admin')
    ) {
      return res.status(403).send('Not allowed.');
    }
    res.render('appointment_confirm', { appointment });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load appointment.');
  }
});

router.get('/appointments/:id/status', requireLogin, async (req, res) => {
  try {
    const appointment = await get(
      `SELECT a.*, u.name as doctor_name, d.visit_duration_minutes
       FROM appointments a
       JOIN users u ON a.doctor_id = u.id
       JOIN doctors d ON d.user_id = u.id
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (!appointment || appointment.patient_id !== req.session.user.id) {
      return res.status(403).json({ error: 'Not allowed.' });
    }
    const dayAppointments = await all(
      `SELECT serial_no, status, slot_time
       FROM appointments
       WHERE doctor_id = ? AND date = ?
       ORDER BY serial_no`,
      [appointment.doctor_id, appointment.date]
    );
    const active = dayAppointments.filter(
      (a) => !['completed', 'no_show', 'cancelled'].includes(a.status)
    );
    let nowServingSerial = null;
    if (active.length > 0) {
      nowServingSerial = active[0].serial_no;
    }
    const visitDuration = appointment.visit_duration_minutes || 10;
    const startTime = dayAppointments[0]?.slot_time || appointment.slot_time || '09:00';
    const etaDate = new Date(`${appointment.date}T${startTime}`);
    if (!Number.isNaN(etaDate.getTime())) {
      etaDate.setMinutes(etaDate.getMinutes() + visitDuration * (appointment.serial_no - 1));
    }
    res.json({
      appointment_id: appointment.id,
      doctor: appointment.doctor_name,
      your_serial: appointment.serial_no,
      status: appointment.status,
      now_serving: nowServingSerial,
      eta: Number.isNaN(etaDate.getTime()) ? null : etaDate.toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load status.' });
  }
});

router.get('/appointments/:id/status/view', requireLogin, async (req, res) => {
  try {
    const appointment = await get(
      `SELECT id FROM appointments WHERE id = ? AND patient_id = ?`,
      [req.params.id, req.session.user.id]
    );
    if (!appointment) {
      return res.status(403).send('Not allowed.');
    }
    res.render('appointment_status', { appointmentId: appointment.id });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load status page.');
  }
});

router.get('/appointments/:id/form', requireLogin, async (req, res) => {
  try {
    const appointment = await get(
      `SELECT * FROM appointments WHERE id = ?`,
      [req.params.id]
    );
    if (!appointment || appointment.patient_id !== req.session.user.id) {
      return res.status(403).send('Not allowed.');
    }
    const existing = await get(
      `SELECT answers_json FROM appointment_answers WHERE appointment_id = ?`,
      [appointment.id]
    );
    const answers = existing ? JSON.parse(existing.answers_json) : null;
    res.render('appointment_form', { appointment, answers });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load form.');
  }
});

router.post('/appointments/:id/form', requireLogin, async (req, res) => {
  try {
    const appointment = await get(
      `SELECT * FROM appointments WHERE id = ?`,
      [req.params.id]
    );
    if (!appointment || appointment.patient_id !== req.session.user.id) {
      return res.status(403).send('Not allowed.');
    }
    const answers = {
      symptoms: req.body.symptoms || '',
      duration: req.body.duration || '',
      medications: req.body.medications || '',
    };
    const existing = await get(
      `SELECT id FROM appointment_answers WHERE appointment_id = ?`,
      [appointment.id]
    );
    if (existing) {
      await run(
        `UPDATE appointment_answers SET answers_json = ? WHERE appointment_id = ?`,
        [JSON.stringify(answers), appointment.id]
      );
    } else {
      await run(
        `INSERT INTO appointment_answers (appointment_id, answers_json) VALUES (?, ?)`,
        [appointment.id, JSON.stringify(answers)]
      );
    }
    res.redirect(`/appointments/${appointment.id}/confirm`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to save form.');
  }
});

router.post('/appointments/:id/cancel', requireLogin, async (req, res) => {
  try {
    const appointment = await get(
      `SELECT a.*, u.name as doctor_name
       FROM appointments a
       JOIN users u ON a.doctor_id = u.id
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (!appointment || appointment.patient_id !== req.session.user.id) {
      return res.status(403).send('Not allowed.');
    }
    const lockedStatuses = ['completed', 'no_show', 'cancelled', 'in_consultation'];
    if (lockedStatuses.includes(appointment.status)) {
      return renderNotice(res, 'Too late to cancel', 'This visit is already in progress.', [
        { href: '/dashboard/patient', label: 'Back to dashboard' },
      ]);
    }
    await run(`UPDATE appointments SET status = 'cancelled' WHERE id = ?`, [appointment.id]);
    renderNotice(res, 'Appointment cancelled', `Serial #${appointment.serial_no} with Dr. ${appointment.doctor_name} has been released.`, [
      { href: `/doctors/${appointment.doctor_id}`, label: 'Book this doctor again' },
      { href: '/dashboard/patient', label: 'Return to dashboard' },
    ]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to cancel appointment.');
  }
});

module.exports = router;
