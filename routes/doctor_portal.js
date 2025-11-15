const express=require('express');
const { all, get, run } = require('../db');
const router=express.Router();

function needDoctor(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='doctor') return res.status(403).send('Doctor access only');
  next();
}

router.get('/doctor/dashboard', needDoctor, async (req,res,next)=>{
  try{
    const userId=req.session.user.id;
    const doctor=await get(`
      SELECT id AS doctor_id, visit_duration_minutes, running_late_minutes
      FROM doctors
      WHERE user_id=?
    `,[userId]);
    if(!doctor) return res.status(404).send('Doctor profile not found');

    const appointments=await all(`
      SELECT
        a.id,
        a.appt_date,
        a.slot_time,
        a.status,
        c.name AS clinic_name,
        u.name AS patient_name
      FROM appointments a
      JOIN users u ON u.id=a.patient_id
      LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
      WHERE a.doctor_id=? AND a.appt_date=date('now','localtime')
      ORDER BY a.slot_time ASC, a.id ASC
    `,[userId]);

    const visitDuration=doctor.visit_duration_minutes ?? 15;
    const runningLateMinutes=doctor.running_late_minutes ?? 0;
    const nonQueueStatuses=new Set(['done','completed','cancelled','no_show']);
    let position=1;
    for(const appt of appointments){
      const status=(appt.status||'').toLowerCase();
      if(!nonQueueStatuses.has(status)){
        appt.position=position;
        appt.etaMinutes=(position-1)*visitDuration+runningLateMinutes;
        position++;
      }
    }

    const todayStatsRow = await get(`
      SELECT COUNT(*) AS cnt
      FROM appointments
      WHERE doctor_id = ?
        AND appt_date = date('now','localtime')
    `, [userId]);

    const doneStatsRow = await get(`
      SELECT COUNT(*) AS cnt
      FROM appointments
      WHERE doctor_id = ?
        AND appt_date = date('now','localtime')
        AND status IN ('done','completed')
    `, [userId]);

    const uniqueStatsRow = await get(`
      SELECT COUNT(DISTINCT patient_id) AS cnt
      FROM appointments
      WHERE doctor_id = ?
    `, [userId]);

    const stats = {
      totalToday: todayStatsRow ? todayStatsRow.cnt : 0,
      doneToday: doneStatsRow ? doneStatsRow.cnt : 0,
      totalUniquePatients: uniqueStatsRow ? uniqueStatsRow.cnt : 0
    };

    res.render('dashboard_doctor', {
      doctor,
      appointments,
      visitDuration,
      runningLateMinutes,
      stats
    });
  }catch(err){
    next(err);
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

async function setStatus(id,status,tsField){
  if(tsField){ await run(`UPDATE appointments SET status=?, ${tsField}=CURRENT_TIMESTAMP WHERE id=?`,[status,id]); }
  else{ await run(`UPDATE appointments SET status=? WHERE id=?`,[status,id]); }
}
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
