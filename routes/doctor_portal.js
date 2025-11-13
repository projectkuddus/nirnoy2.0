const express=require('express');
const { all, get, run } = require('../db');
const router=express.Router();

async function loadDoctorProfile(userId){
  return await get(`SELECT * FROM doctors WHERE user_id=?`,[userId]);
}

async function needDoctor(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='doctor') return res.status(403).send('Doctor access only');
  const profile=await loadDoctorProfile(req.session.user.id);
  if(!profile) return res.status(403).send('Doctor profile missing');
  req.doctorProfile=profile;
  next();
}

// Dashboard: today queue + running-late/current duration
router.get('/doctor/dashboard', needDoctor, async (req,res)=>{
  const today=new Date().toISOString().slice(0,10);
  const rows=await all(`
    SELECT a.*, p.name AS patient_name, p.email AS patient_email
    FROM appointments a
    JOIN users p ON p.id=a.patient_id
    WHERE a.doctor_id=? AND a.date=?
    ORDER BY a.slot_time
  `,[req.doctorProfile.id, today]);

  const visit_duration = req.doctorProfile.visit_duration_minutes ?? 15;
  const running_late = req.doctorProfile.running_late_minutes ?? 0;

  res.render('dashboard_doctor',{rows, visit_duration, running_late});
});

// status actions
async function setStatus(id,status,tsField){
  if(tsField){ await run(`UPDATE appointments SET status=?, ${tsField}=CURRENT_TIMESTAMP WHERE id=?`,[status,id]); }
  else{ await run(`UPDATE appointments SET status=? WHERE id=?`,[status,id]); }
}
router.post('/doctor/appointments/:id/call', needDoctor, async (req,res)=>{ await setStatus(req.params.id,'called','called_at'); res.redirect('/doctor/dashboard'); });
router.post('/doctor/appointments/:id/start', needDoctor, async (req,res)=>{ await setStatus(req.params.id,'in_progress','started_at'); res.redirect('/doctor/dashboard'); });
router.post('/doctor/appointments/:id/done', needDoctor, async (req,res)=>{ await setStatus(req.params.id,'done','finished_at'); res.redirect('/doctor/dashboard'); });
router.post('/doctor/appointments/:id/noshow', needDoctor, async (req,res)=>{ await setStatus(req.params.id,'no_show'); res.redirect('/doctor/dashboard'); });
router.post('/doctor/appointments/:id/room', needDoctor, async (req,res)=>{ await run(`UPDATE appointments SET room=? WHERE id=?`,[req.body.room||'', req.params.id]); res.redirect('/doctor/dashboard'); });

// Set running-late (minutes)
router.post('/doctor/running-late', needDoctor, async (req,res)=>{
  const mins = Math.max(0, parseInt(req.body.minutes||'0',10)||0);
  await run(`UPDATE doctors SET running_late_minutes=? WHERE id=?`,[mins, req.doctorProfile.id]);
  req.session.flash={type:'ok',msg:`Running late set to +${mins} min`};
  res.redirect('/doctor/dashboard');
});

// Doctor intake template
router.get('/doctor/intake', needDoctor, async (req,res)=>{
  let lines='';
  if(req.doctorProfile.intake_json){
    try{ lines=JSON.parse(req.doctorProfile.intake_json).join('\n'); }catch(_){ lines=''; }
  }
  res.render('doctor_intake',{lines});
});
router.post('/doctor/intake', needDoctor, async (req,res)=>{
  const raw=(req.body.lines||'').split('\n').map(s=>s.trim()).filter(Boolean);
  const json=JSON.stringify(raw.slice(0,50));
  await run(`UPDATE doctors SET intake_json=? WHERE id=?`,[json, req.doctorProfile.id]);
  req.session.flash={type:'ok',msg:'Intake template saved'};
  res.redirect('/doctor/intake');
});

// Visit editor
router.get('/doctor/appointments/:id/edit', needDoctor, async (req,res)=>{
  const a=await get(`
    SELECT a.*, a.date AS appt_date, p.name AS patient_name, du.name AS doctor_name
    FROM appointments a
    JOIN users p  ON p.id=a.patient_id
    JOIN doctors d ON d.id=a.doctor_id
    JOIN users du ON du.id=d.user_id
    WHERE a.id=? AND a.doctor_id=?`,[req.params.id, req.doctorProfile.id]);
  if(!a) return res.status(404).send('Not found');

  const intakeRow = await get(`SELECT answers_json FROM appointment_intake WHERE appointment_id=? ORDER BY id DESC LIMIT 1`,[a.id]);
  let intake=null; if(intakeRow?.answers_json){ try{ intake=JSON.parse(intakeRow.answers_json); }catch(_){ intake=null; } }

  res.render('appointment_detail',{a,intake});
});
router.post('/doctor/appointments/:id/update', needDoctor, async (req,res)=>{
  await run(`UPDATE appointments SET diagnosis=?, prescription_text=?, advice=? WHERE id=? AND doctor_id=?`,
    [req.body.diagnosis||'', req.body.prescription_text||'', req.body.advice||'', req.params.id, req.doctorProfile.id]);
  req.session.flash={type:'ok',msg:'Saved'};
  res.redirect(`/doctor/appointments/${req.params.id}/edit`);
});

module.exports=router;
