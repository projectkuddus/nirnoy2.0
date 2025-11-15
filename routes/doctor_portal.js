const express=require('express');
const { all, get, run } = require('../db');
const notify=require('../notify');
const router=express.Router();

function needDoctor(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='doctor') return res.status(403).send('Doctor access only');
  next();
}

router.get('/doctor/dashboard', needDoctor, async (req,res)=>{
  try{
    const user=req.session.user;
    if(!user || user.role!=='doctor'){
      return res.redirect('/login');
    }
    const doctorUserId=user.id;
    const todayStr=new Date().toISOString().slice(0,10);
    const successMessage=req.query.success?String(req.query.success):null;
    const errorMessage=req.query.error?String(req.query.error):null;

    const doctor=await get(`SELECT * FROM doctors WHERE user_id=?`,[doctorUserId]);
    if(!doctor){
      return res.status(404).render('404',{user});
    }

    const rows=await all(`
      SELECT
        a.*,
        u.name AS patient_name,
        u.email AS patient_email,
        c.name AS clinic_name,
        c.area AS clinic_area
      FROM appointments a
      JOIN users u ON u.id=a.patient_id
      LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
      WHERE a.doctor_id=?
      ORDER BY a.appt_date ASC, a.slot_time ASC, a.id ASC
    `,[doctorUserId]);

    const allAppointments=rows||[];
    const todayQueue=[];
    const upcomingAppointments=[];
    const pastAppointments=[];
    for(const appt of allAppointments){
      const status=(appt.status||'').toLowerCase();
      const date=appt.appt_date||'';
      if(status==='cancelled' || status==='done' || status==='completed' || status==='no_show'){
        pastAppointments.push(appt);
        continue;
      }
      if(date && date < todayStr){
        pastAppointments.push(appt);
        continue;
      }
      if(date===todayStr){
        if(!status || status==='booked' || status==='upcoming' || status==='queued' || status==='called' || status==='in_progress'){
          todayQueue.push(appt);
          upcomingAppointments.push(appt);
        }else{
          pastAppointments.push(appt);
        }
      }else if(date>todayStr){
        upcomingAppointments.push(appt);
      }else{
        pastAppointments.push(appt);
      }
    }

    let nextAppointment=null;
    if(todayQueue.length){
      nextAppointment=todayQueue[0];
    }else if(upcomingAppointments.length){
      nextAppointment=upcomingAppointments[0];
    }

    let metricsTodayTotal=0;
    let metricsTodayCompleted=0;
    let metricsTodayCancelled=0;
    let metricsUpcomingTotal=0;
    const uniquePatientIds=new Set();
    for(const appt of allAppointments){
      const status=(appt.status||'').toLowerCase();
      const date=appt.appt_date||'';
      if(appt.patient_id){
        uniquePatientIds.add(appt.patient_id);
      }
      if(date===todayStr){
        metricsTodayTotal++;
        if(status==='completed' || status==='done'){
          metricsTodayCompleted++;
        }else if(status==='cancelled'){
          metricsTodayCancelled++;
        }
      }
    }
    metricsUpcomingTotal=upcomingAppointments.length;
    const metrics={
      todayTotal:metricsTodayTotal,
      todayCompleted:metricsTodayCompleted,
      todayCancelled:metricsTodayCancelled,
      upcomingTotal:metricsUpcomingTotal,
      uniquePatients:uniquePatientIds.size
    };

    const clinicRow=await get(`SELECT COUNT(*) AS clinic_count FROM doctor_clinics WHERE doctor_id=?`,[doctor.id]);
    const clinicsCount=clinicRow?clinicRow.clinic_count:0;
    const scheduleRow=await get(`SELECT COUNT(*) AS schedule_count FROM doctor_schedule WHERE doctor_id=?`,[doctor.id]);
    const scheduleCount=scheduleRow?scheduleRow.schedule_count:0;
    const scheduleEntries=await all(`
      SELECT
        ds.*,
        dc.name AS clinic_name,
        dc.area AS clinic_area
      FROM doctor_schedule ds
      LEFT JOIN doctor_clinics dc ON dc.id = ds.clinic_id
      WHERE ds.doctor_id = ?
      ORDER BY dc.name ASC, ds.day_of_week ASC, ds.start_time ASC
    `,[doctor.id]);

    res.render('dashboard_doctor',{
      user,
      doctor,
      nextAppointment,
      todayQueue,
      upcomingAppointments,
      pastAppointments,
      success:successMessage,
      error:errorMessage,
      clinicsCount,
      scheduleCount,
      scheduleEntries,
      metrics
    });
  }catch(err){
    console.error('Error loading doctor dashboard',err);
    res.status(500).render('500',{
      user:req.session.user,
      message:'Failed to load doctor dashboard.'
    });
  }
});

router.get('/doctor/patients', needDoctor, async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    const rows = await all(`
      SELECT
        u.id AS patient_id,
        u.name AS patient_name,
        u.email AS patient_email,
        MIN(a.appt_date) AS first_visit,
        MAX(a.appt_date) AS last_visit,
        COUNT(*) AS total_visits
      FROM appointments a
      JOIN users u ON u.id = a.patient_id
      WHERE a.doctor_id = ?
      GROUP BY u.id, u.name, u.email
      ORDER BY last_visit DESC
    `, [userId]);

    res.render('doctor_patients', { patients: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/doctor/patients/:patientId', needDoctor, async (req, res, next) => {
  try {
    const user = req.session.user;
    const patientId = parseInt(req.params.patientId, 10);
    if (!patientId) {
      return res.status(404).render('404', { user });
    }

    const doctorRow = await get(
      `
      SELECT d.id AS doctor_id
      FROM doctors d
      WHERE d.user_id = ?
      `,
      [user.id]
    );
    if (!doctorRow) {
      return res.status(404).render('404', { user });
    }
    const doctorId = doctorRow.doctor_id;

    const patientSummary = await get(
      `
      SELECT
        u.id AS id,
        u.name,
        u.email,
        MIN(a.appt_date) AS first_visit,
        MAX(a.appt_date) AS last_visit,
        COUNT(*) AS total_visits
      FROM appointments a
      JOIN users u ON u.id = a.patient_id
      WHERE a.doctor_id = ?
        AND a.patient_id = ?
      `,
      [doctorId, patientId]
    );

    if (!patientSummary) {
      return res.status(404).render('404', { user });
    }

    const visits = await all(
      `
      SELECT
        a.id,
        a.appt_date,
        a.slot_time,
        a.status,
        c.name AS clinic_name,
        c.area AS clinic_area,
        co.diagnosis_summary
      FROM appointments a
      LEFT JOIN doctor_clinics c ON c.id = a.clinic_id
      LEFT JOIN consultations co ON co.appointment_id = a.id
      WHERE a.doctor_id = ?
        AND a.patient_id = ?
      ORDER BY a.appt_date DESC, a.slot_time DESC, a.id DESC
      `,
      [doctorId, patientId]
    );

    res.render('doctor_patient_detail', {
      user,
      doctor: doctorRow,
      patient: patientSummary,
      visits
    });
  } catch (err) {
    next(err);
  }
});

async function setStatus(id,status,tsField){
  if(tsField){ await run(`UPDATE appointments SET status=?, ${tsField}=CURRENT_TIMESTAMP WHERE id=?`,[status,id]); }
  else{ await run(`UPDATE appointments SET status=? WHERE id=?`,[status,id]); }
}

router.post('/doctor/appointments/:id/complete', needDoctor, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const appointmentId = req.params.id;

    const appt = await get(
      `SELECT id, status FROM appointments WHERE id = ? AND doctor_id = ?`,
      [appointmentId, userId]
    );

    if (!appt) {
      return res.redirect('/doctor/dashboard?error=' + encodeURIComponent('Appointment not found for this doctor.'));
    }

    const status = (appt.status || '').toLowerCase();
    if (status === 'cancelled') {
      return res.redirect('/doctor/dashboard?error=' + encodeURIComponent('Cancelled appointments cannot be completed.'));
    }

    await run(`UPDATE appointments SET status = 'completed' WHERE id = ?`, [appointmentId]);

    return res.redirect('/doctor/dashboard?success=' + encodeURIComponent('Appointment marked as completed.'));
  } catch (err) {
    console.error('Error completing appointment', err);
    return res.redirect('/doctor/dashboard?error=' + encodeURIComponent('Something went wrong while updating the appointment.'));
  }
});

router.post('/doctor/appointments/:id/cancel', needDoctor, async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || user.role !== 'doctor') {
      return res.redirect('/login');
    }

    const appointmentId = req.params.id;
    const doctorId = user.id;

    const appt = await get(
      `
      SELECT *
      FROM appointments
      WHERE id = ?
        AND doctor_id = ?
      `,
      [appointmentId, doctorId]
    );

    if (!appt) {
      return res.redirect('/doctor/dashboard?error=' + encodeURIComponent('Appointment not found for this doctor.'));
    }

    const status = (appt.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'completed') {
      return res.redirect('/doctor/dashboard?success=' + encodeURIComponent('This appointment is already closed.'));
    }

    await run(
      `
      UPDATE appointments
      SET status = 'cancelled'
      WHERE id = ?
      `,
      [appointmentId]
    );

    const patient = appt.patient_id
      ? await get(
          `SELECT * FROM patients WHERE id = ?`,
          [appt.patient_id]
        )
      : null;

    const clinic = appt.clinic_id
      ? await get(
          `SELECT * FROM clinics WHERE id = ?`,
          [appt.clinic_id]
        )
      : null;

    let doctor = {
      id: user.id,
      name: user.name,
      email: user.email
    };

    if (!doctor.name || !doctor.email) {
      const doctorRow = await get(
        `SELECT * FROM doctors WHERE id = ?`,
        [doctorId]
      );
      if (doctorRow) {
        doctor = doctorRow;
      }
    }

    try {
      if (notify?.patientBookingCancelled) {
        await notify.patientBookingCancelled({
          initiator: 'doctor',
          patient,
          doctor,
          clinic,
          appointment: appt
        });
      }
      if (notify?.doctorBookingCancelled) {
        await notify.doctorBookingCancelled({
          initiator: 'doctor',
          patient,
          doctor,
          clinic,
          appointment: appt
        });
      }
    } catch (notifyErr) {
      console.error('Error in doctor cancel notification', notifyErr);
    }

    return res.redirect('/doctor/dashboard?success=' + encodeURIComponent('Appointment cancelled.'));
  } catch (err) {
    console.error('Error cancelling appointment (doctor)', err);
    return res.redirect('/doctor/dashboard?error=' + encodeURIComponent('Could not cancel this appointment.'));
  }
});

router.get('/doctor/appointments/:id', needDoctor, async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || user.role !== 'doctor') {
      return res.redirect('/login');
    }

    const doctorId = user.id;
    const apptId = parseInt(req.params.id, 10);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(404).render('404', { user, message: 'Appointment not found.' });
    }

    const appt = await get(`
      SELECT
        a.*,
        u.name AS patient_name,
        u.email AS patient_email,
        c.name AS clinic_name,
        c.area AS clinic_area,
        c.address AS clinic_address,
        c.phone AS clinic_phone
      FROM appointments a
      JOIN users u ON u.id = a.patient_id
      LEFT JOIN doctor_clinics c ON c.id = a.clinic_id
      WHERE a.id = ? AND a.doctor_id = ?
    `,[apptId, doctorId]);

    if (!appt) {
      return res.status(404).render('404', { user, message: 'Appointment not found.' });
    }

    res.render('doctor_appointment_detail', { user, appt });
  } catch (err) {
    console.error('Error loading doctor appointment detail', err);
    res.status(500).render('500', { user: req.session.user, message: 'Failed to load this visit.' });
  }
});
router.post('/doctor/appointments/:id/call', needDoctor, async (req,res)=>{ await setStatus(req.params.id,'called','called_at'); res.redirect('/doctor/dashboard'); });
router.post('/doctor/appointments/:id/start', needDoctor, async (req,res)=>{ await setStatus(req.params.id,'in_progress','started_at'); res.redirect('/doctor/dashboard'); });
router.post('/doctor/appointments/:id/done', needDoctor, async (req,res)=>{ await setStatus(req.params.id,'done','finished_at'); res.redirect('/doctor/dashboard'); });
router.post('/doctor/appointments/:id/noshow', needDoctor, async (req,res)=>{ await setStatus(req.params.id,'no_show'); res.redirect('/doctor/dashboard'); });
router.post('/doctor/appointments/:id/room', needDoctor, async (req,res)=>{
  // Room field is currently not stored in DB on this instance.
  // Keep this endpoint as a harmless no-op for now.
  res.redirect('/doctor/dashboard');
});

router.post('/doctor/running-late', needDoctor, async (req,res)=>{
  const mins = Math.max(0, parseInt(req.body.minutes||'0',10)||0);
  await run(`UPDATE doctors SET running_late_minutes=? WHERE user_id=?`,[mins, req.session.user.id]);
  req.session.flash={type:'ok',msg:`Running late set to +${mins} min`};
  res.redirect('/doctor/dashboard');
});

router.get('/doctor/appointments/:id/edit', needDoctor, async (req,res)=>{
  const a=await get(`
    SELECT a.*, p.name AS patient_name, du.name AS doctor_name
    FROM appointments a
    JOIN users p  ON p.id=a.patient_id
    JOIN users du ON du.id=a.doctor_id
    WHERE a.id=? AND a.doctor_id=?`,[req.params.id, req.session.user.id]);
  if(!a) return res.status(404).send('Not found');

  const intakeRow = await get(`SELECT answers_json FROM appointment_intake WHERE appointment_id=? ORDER BY id DESC LIMIT 1`,[a.id]);
  let intake=null; if(intakeRow?.answers_json){ try{ intake=JSON.parse(intakeRow.answers_json); }catch(_){ intake=null; } }

  res.render('appointment_detail',{a, intake});
});
router.post('/doctor/appointments/:id/update', needDoctor, async (req,res)=>{
  await run(`UPDATE appointments SET diagnosis=?, prescription_text=?, advice=? WHERE id=? AND doctor_id=?`,
    [req.body.diagnosis||'', req.body.prescription_text||'', req.body.advice||'', req.params.id, req.session.user.id]);
  req.session.flash={type:'ok',msg:'Saved'};
  res.redirect(`/doctor/appointments/${req.params.id}/edit`);
});

module.exports=router;
