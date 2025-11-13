const express=require('express');
const { all, get, run } = require('../db');
const router=express.Router();

function needDoctor(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='doctor') return res.status(403).send('Doctor access only');
  next();
}

// Dashboard: today queue + running-late/current duration
router.get('/doctor/dashboard', needDoctor, async (req,res)=>{
  const u=req.session.user;
  const today=new Date().toISOString().slice(0,10);
  const rows=await all(`
    SELECT a.*, p.name AS patient_name, p.email AS patient_email
    FROM appointments a
    JOIN users p ON p.id=a.patient_id
    WHERE a.doctor_id=? AND a.date=?
    ORDER BY a.slot_time
  `,[u.id, today]);

  const d=await get(`SELECT visit_duration_minutes, running_late_minutes FROM doctors WHERE user_id=?`,[u.id]);
  const visit_duration = d?.visit_duration_minutes ?? 15;
  const running_late = d?.running_late_minutes ?? 0;

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
  await run(`UPDATE doctors SET running_late_minutes=? WHERE user_id=?`,[mins, req.session.user.id]);
  req.session.flash={type:'ok',msg:`Running late set to +${mins} min`};
  res.redirect('/doctor/dashboard');
});

// Visit editor
router.get('/doctor/appointments/:id/edit', needDoctor, async (req,res)=>{
  const a=await get(`
    SELECT a.*, p.name AS patient_name, du.name AS doctor_name
    FROM appointments a
    JOIN users p  ON p.id=a.patient_id
    JOIN users du ON du.id=a.doctor_id
    WHERE a.id=? AND a.doctor_id=?`,[req.params.id, req.session.user.id]);
  if(!a) return res.status(404).send('Not found');
  res.render('appointment_detail',{a});
});
router.post('/doctor/appointments/:id/update', needDoctor, async (req,res)=>{
  await run(`UPDATE appointments SET diagnosis=?, prescription_text=?, advice=? WHERE id=? AND doctor_id=?`,
    [req.body.diagnosis||'', req.body.prescription_text||'', req.body.advice||'', req.params.id, req.session.user.id]);
  req.session.flash={type:'ok',msg:'Saved'};
  res.redirect(`/doctor/appointments/${req.params.id}/edit`);
});

module.exports=router;
