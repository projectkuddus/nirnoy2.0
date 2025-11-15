const express=require('express');
const {all,get,run}=require('../db');
const notify=require('../notify');
const router=express.Router();

function needPatient(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='patient') return res.status(403).send('Patient access only');
  next();
}

router.get('/patient/dashboard', needPatient, async (req,res)=>{
  try{
    if(!req.session.user || req.session.user.role!=='patient'){
      return res.redirect('/login');
    }
    const patientId=req.session.user.id;
    const successMessage=req.query.success ? String(req.query.success) : null;
    const errorMessage=req.query.error ? String(req.query.error) : null;

    const todayStr=new Date().toISOString().slice(0,10);
    const rows=await all(`
      SELECT
        a.*,
        d.name AS doctor_name,
        d.specialty AS doctor_specialty,
        d.area AS doctor_area,
        c.name AS clinic_name,
        c.area AS clinic_area
      FROM appointments a
      LEFT JOIN doctors d ON d.id=a.doctor_id
      LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
      WHERE a.patient_id=?
      ORDER BY a.appt_date ASC, a.slot_time ASC, a.id ASC
    `,[patientId]);

    const allAppointments=rows||[];
    const upcomingAppointments=[];
    const pastAppointments=[];
    let nextAppointment=null;
    for(const appt of allAppointments){
      const date=appt.appt_date||'';
      const status=(appt.status||'').toLowerCase();
      const isCancelled=status==='cancelled';
      if(date>=todayStr && !isCancelled){
        upcomingAppointments.push(appt);
        if(!nextAppointment){
          nextAppointment=appt;
        }
      }else{
        pastAppointments.push(appt);
      }
    }

    const doctorMap=new Map();
    for(const appt of allAppointments){
      if(!appt.doctor_id) continue;
      const id=appt.doctor_id;
      const existing=doctorMap.get(id)||{
        doctor_id:id,
        doctor_name:appt.doctor_name||'Doctor',
        doctor_specialty:appt.doctor_specialty||null,
        doctor_area:appt.doctor_area||null,
        last_visit_date:appt.appt_date||null
      };
      if(appt.appt_date && (!existing.last_visit_date || appt.appt_date>existing.last_visit_date)){
        existing.last_visit_date=appt.appt_date;
      }
      doctorMap.set(id,existing);
    }
    const myDoctors=Array.from(doctorMap.values()).sort((a,b)=>{
      const aDate=a.last_visit_date||'';
      const bDate=b.last_visit_date||'';
      if(aDate<bDate) return 1;
      if(aDate>bDate) return -1;
      return 0;
    });

    res.render('dashboard_patient',{
      user:req.session.user,
      nextAppointment,
      upcomingAppointments,
      pastAppointments,
      success:successMessage,
      error:errorMessage,
      myDoctors
    });
  }catch(err){
    console.error('Error loading patient dashboard',err);
    res.status(500).render('500',{
      user:req.session.user,
      message:'Failed to load your dashboard.',
      error:err
    });
  }
});

router.get('/consultations/appointment/:id', needPatient, async (req,res)=>{
  const me = req.session.user;
  const a=await get(`SELECT a.*, du.name AS doctor_name, c.name AS clinic_name
    FROM appointments a JOIN doctors d ON d.id=a.doctor_id
    JOIN users du ON du.id=d.user_id
    LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
    WHERE a.id=? AND a.patient_id=?`,[req.params.id,me.id]);
  if(!a) return res.status(404).send('Not found');
  const c=await get(`SELECT * FROM consultations WHERE appointment_id=?`,[a.id]);
  res.render('consultation_view',{a,cons:c});
});

router.get('/patient/export', needPatient, async (req,res)=>{
  const me = req.session.user;

  const appointments = await all(`
    SELECT
      a.id,
      a.appt_date,
      a.slot_time,
      a.status,
      a.serial_no,
      a.clinic_id,
      a.doctor_id,
      a.for_person_name,
      a.diagnosis,
      a.prescription_text,
      a.advice,
      du.name AS doctor_name,
      du.email AS doctor_email,
      c.name AS clinic_name,
      c.area AS clinic_area
    FROM appointments a
    JOIN doctors d ON d.user_id = a.doctor_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN doctor_clinics c ON c.id = a.clinic_id
    WHERE a.patient_id = ?
    ORDER BY a.appt_date, a.slot_time
  `,[me.id]);

  const exportPayload = {
    patient: {
      id: me.id,
      name: me.name,
      email: me.email
    },
    generated_at: new Date().toISOString(),
    appointments
  };

  const fileName = `nirnoy_patient_${me.id}_${new Date().toISOString().slice(0,10)}.json`;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Content-Disposition',`attachment; filename="${fileName}"`);
  res.send(JSON.stringify(exportPayload,null,2));
});

router.get('/patient/appointments', needPatient, async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || user.role !== 'patient') {
      return res.redirect('/login');
    }

    const patientId = user.id;
    const successMessage = req.query.success ? String(req.query.success) : null;
    const errorMessage = req.query.error ? String(req.query.error) : null;

    const todayStr = new Date().toISOString().slice(0, 10);

    const rows = await all(`
      SELECT
        a.*,
        d.name AS doctor_name,
        d.specialty AS doctor_specialty,
        d.area AS doctor_area,
        c.name AS clinic_name,
        c.area AS clinic_area
      FROM appointments a
      LEFT JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN doctor_clinics c ON c.id = a.clinic_id
      WHERE a.patient_id = ?
      ORDER BY a.appt_date DESC, a.slot_time DESC, a.id DESC
    `, [patientId]);

    const allAppointments = rows || [];
    const upcomingAppointments = [];
    const pastAppointments = [];
    for (const appt of allAppointments) {
      const date = appt.appt_date || '';
      const status = (appt.status || '').toLowerCase();
      const isCancelled = status === 'cancelled';
      const isFutureOrToday = date >= todayStr;

      if (isFutureOrToday && !isCancelled) {
        upcomingAppointments.push(appt);
      } else {
        pastAppointments.push(appt);
      }
    }

    return res.render('patient_appointments', {
      user,
      upcomingAppointments,
      pastAppointments,
      success: successMessage,
      error: errorMessage
    });
  } catch (err) {
    console.error('Error loading patient appointments page', err);
    return res.status(500).render('500', {
      user: req.session.user,
      message: 'Failed to load your visits.'
    });
  }
});

router.get('/patient/appointments/:id', needPatient, async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || user.role !== 'patient') {
      return res.redirect('/login');
    }

    const patientId = user.id;
    const apptId = parseInt(req.params.id, 10);
    if (!apptId || Number.isNaN(apptId)) {
      return res.status(404).render('404', {
        user,
        message: 'Appointment not found.'
      });
    }

    const appt = await get(`
      SELECT
        a.*,
        d.name AS doctor_name,
        d.specialty AS doctor_specialty,
        d.area AS doctor_area,
        c.name AS clinic_name,
        c.area AS clinic_area,
        c.address AS clinic_address,
        c.phone AS clinic_phone
      FROM appointments a
      LEFT JOIN doctors d ON d.id = a.doctor_id
      LEFT JOIN doctor_clinics c ON c.id = a.clinic_id
      WHERE a.id = ? AND a.patient_id = ?
    `, [apptId, patientId]);

    if (!appt) {
      return res.status(404).render('404', {
        user,
        message: 'Appointment not found.'
      });
    }

    res.render('patient_appointment_detail', { user, appt });
  } catch (err) {
    console.error('Error loading appointment detail', err);
    res.status(500).render('500', {
      user: req.session.user,
      message: 'Failed to load appointment details.'
    });
  }
});

router.get('/patient/appointments/:id/reschedule', needPatient, async (req, res) => {
  try {
    const patientId = req.session.user.id;
    const appointmentId = req.params.id;

    const appt = await get(
      `SELECT * FROM appointments WHERE id = ? AND patient_id = ?`,
      [appointmentId, patientId]
    );

    if (!appt) {
      return res.redirect('/patient/appointments?error=' + encodeURIComponent('Appointment not found.'));
    }

    const status = (appt.status || '').toLowerCase();
    if (status !== 'booked' && status !== 'queued') {
      return res.redirect('/patient/appointments?error=' + encodeURIComponent('Only upcoming appointments can be rescheduled.'));
    }

    const params = new URLSearchParams();
    if (appt.doctor_id) params.set('doctorId', String(appt.doctor_id));
    if (appt.clinic_id) params.set('clinicId', String(appt.clinic_id));
    if (appt.appt_date) params.set('date', String(appt.appt_date));
    if (appt.slot_time) params.set('slot_time', String(appt.slot_time));
    params.set('rescheduleId', String(appointmentId));

    return res.redirect(`/book?${params.toString()}`);
  } catch (err) {
    console.error('Error preparing reschedule', err);
    return res.redirect('/patient/appointments?error=' + encodeURIComponent('Could not prepare reschedule.'));
  }
});

router.post('/patient/appointments/:id/cancel', needPatient, async (req, res) => {
  try {
    const user = req.session.user;
    if (!user || user.role !== 'patient') {
      return res.redirect('/login');
    }

    const appointmentId = req.params.id;
    const patientId = user.id;

    const appt = await get(
      `
      SELECT *
      FROM appointments
      WHERE id = ?
        AND patient_id = ?
      `,
      [appointmentId, patientId]
    );

    if (!appt) {
      return res.redirect(
        '/patient/appointments?error=' +
        encodeURIComponent('Appointment not found.')
      );
    }

    const status = (appt.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'completed') {
      return res.redirect(
        '/patient/appointments?success=' +
        encodeURIComponent('This appointment is already closed.')
      );
    }

    await run(
      `
      UPDATE appointments
      SET status = 'cancelled'
      WHERE id = ?
      `,
      [appointmentId]
    );

    const doctor = appt.doctor_id
      ? await get(`
          SELECT d.*, u.name AS name, u.email AS email
          FROM doctors d
          JOIN users u ON u.id = d.user_id
          WHERE u.id = ?
        `, [appt.doctor_id])
      : null;

    const clinic = appt.clinic_id
      ? await get(`SELECT * FROM doctor_clinics WHERE id = ?`, [appt.clinic_id])
      : null;

    const patient = {
      id: user.id,
      name: user.name,
      email: user.email
    };

    try {
      if (notify?.patientBookingCancelled) {
        await notify.patientBookingCancelled({
          initiator: 'patient',
          patient,
          doctor,
          clinic,
          appointment: appt
        });
      }
      if (notify?.doctorBookingCancelled) {
        await notify.doctorBookingCancelled({
          initiator: 'patient',
          patient,
          doctor,
          clinic,
          appointment: appt
        });
      }
    } catch (notifyErr) {
      console.error('Error in patient cancel notification', notifyErr);
    }

    return res.redirect(
      '/patient/appointments?success=' +
      encodeURIComponent('Your appointment has been cancelled.')
    );
  } catch (err) {
    console.error('Error cancelling patient appointment', err);
    return res.redirect(
      '/patient/appointments?error=' +
      encodeURIComponent('Could not cancel this appointment.')
    );
  }
});

module.exports=router;
