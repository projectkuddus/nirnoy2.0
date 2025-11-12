const express=require('express');
const {all,get,run}=require('../db');
const router=express.Router();

async function requireDoctor(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  const u=await get('SELECT * FROM users WHERE id=?',[req.session.user.id]);
  if(!u || u.role!=='doctor' || u.status!=='approved') return res.status(403).send('Doctor access only');
  const d=await get('SELECT * FROM doctors WHERE user_id=?',[u.id]);
  if(!d) return res.status(403).send('Doctor profile missing');
  req.doc=d; next();
}

router.get('/doctor/dashboard', requireDoctor, async (req,res)=>{
  const today=new Date().toISOString().slice(0,10);
  const rows=await all(`SELECT a.*, u.name AS patient_name
    FROM appointments a JOIN users u ON u.id=a.patient_id
    WHERE a.doctor_id=? AND a.date=? ORDER BY a.serial_no`, [req.doc.id,today]);
  res.render('dashboard_doctor',{rows,today});
});

router.get('/doctor/appointments/:id', requireDoctor, async (req,res)=>{
  const a=await get(`SELECT a.*, pu.name AS patient_name
    FROM appointments a JOIN users pu ON pu.id=a.patient_id
    WHERE a.id=? AND a.doctor_id=?`, [req.params.id, req.doc.id]);
  if(!a) return res.status(404).send('Not found');
  const answers=await get(`SELECT answers_json FROM appointment_answers WHERE appointment_id=? ORDER BY id DESC LIMIT 1`,[a.id]);
  const cons=await get(`SELECT * FROM consultations WHERE appointment_id=?`,[a.id]);
  res.render('consultation_edit',{a,answers_json:(answers&&answers.answers_json)||'{}',cons});
});

router.post('/doctor/appointments/:id/finish', requireDoctor, async (req,res)=>{
  const {notes,prescription_text,tasks_text}=req.body;
  const existing=await get(`SELECT id FROM consultations WHERE appointment_id=?`,[req.params.id]);
  const tasks_json=JSON.stringify((tasks_text||'').split('\n').map(s=>s.trim()).filter(Boolean));
  if(existing) await run(`UPDATE consultations SET notes=?,prescription_text=?,tasks_json=? WHERE appointment_id=?`,
    [notes||'',prescription_text||'',tasks_json,req.params.id]);
  else await run(`INSERT INTO consultations(appointment_id,notes,prescription_text,tasks_json) VALUES(?,?,?,?)`,
    [req.params.id,notes||'',prescription_text||'',tasks_json]);
  await run(`UPDATE appointments SET status='done' WHERE id=?`,[req.params.id]);
  res.redirect('/doctor/dashboard');
});

module.exports=router;
