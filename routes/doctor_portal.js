const express=require('express');
const { all, get, run } = require('../db');
const router=express.Router();

// Require doctor
function needDoctor(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='doctor') return res.status(403).send('Doctor access only');
  next();
}

// Dashboard: today queue
router.get('/doctor/dashboard', needDoctor, async (req,res)=>{
  const u=req.session.user;
  const today=new Date().toISOString().slice(0,10); // YYYY-MM-DD
  const rows=await all(`
    SELECT a.*, p.name AS patient_name, p.email AS patient_email
    FROM appointments a
    JOIN users p ON p.id=a.patient_id
    WHERE a.doctor_id=? AND a.appt_date=?
    ORDER BY a.slot_time
  `,[u.id, today]);
  res.render('dashboard_doctor',{rows});
});

// Helper: set status + timestamp
async function setStatus(id,status,tsField){
  if(tsField){
    await run(`UPDATE appointments SET status=?, ${tsField}=CURRENT_TIMESTAMP WHERE id=?`,[status,id]);
  }else{
    await run(`UPDATE appointments SET status=? WHERE id=?`,[status,id]);
  }
}

router.post('/doctor/appointments/:id/call', needDoctor, async (req,res)=>{
  await setStatus(req.params.id,'called','called_at'); res.redirect('/doctor/dashboard');
});
router.post('/doctor/appointments/:id/start', needDoctor, async (req,res)=>{
  await setStatus(req.params.id,'in_progress','started_at'); res.redirect('/doctor/dashboard');
});
router.post('/doctor/appointments/:id/done', needDoctor, async (req,res)=>{
  await setStatus(req.params.id,'done','finished_at'); res.redirect('/doctor/dashboard');
});
router.post('/doctor/appointments/:id/noshow', needDoctor, async (req,res)=>{
  await setStatus(req.params.id,'no_show'); res.redirect('/doctor/dashboard');
});

// Optional: set room label for an appointment
router.post('/doctor/appointments/:id/room', needDoctor, async (req,res)=>{
  await run(`UPDATE appointments SET room=? WHERE id=?`,[req.body.room||'', req.params.id]);
  res.redirect('/doctor/dashboard');
});

module.exports=router;
