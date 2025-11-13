const express=require('express');
const {all,get}=require('../db');
const router=express.Router();

function needPatient(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='patient') return res.status(403).send('Patient access only');
  next();
}

router.get('/patient/dashboard', needPatient, async (req,res)=>{
  const me = req.session.user;
  const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD

  // Upcoming: later today (queued/called/in_progress) or any future date
  const upcoming = await all(`
    SELECT a.*, du.name AS doctor_name, c.name AS clinic_name
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
    WHERE a.patient_id = ?
      AND (
           a.appt_date > ?
        OR (a.appt_date = ? AND a.status IN ('queued','called','in_progress'))
      )
    ORDER BY a.appt_date, a.slot_time
  `,[me.id, today, today]);

  // Past: finished/no_show or any day earlier than today
  const past = await all(`
    SELECT a.*, du.name AS doctor_name, c.name AS clinic_name
    FROM appointments a
    JOIN doctors d ON d.id = a.doctor_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
    WHERE a.patient_id = ?
      AND (
           a.appt_date < ?
        OR  a.status IN ('done','no_show')
      )
    ORDER BY a.appt_date DESC, a.slot_time DESC
  `,[me.id, today]);

  res.render('dashboard_patient',{upcoming,past});
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

module.exports=router;
