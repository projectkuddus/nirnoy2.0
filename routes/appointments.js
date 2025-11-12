const express=require('express');const {run,get,all}=require('../db');const router=express.Router();
const needLogin=(req,res,next)=>!req.session.user?res.redirect('/login'):next();

router.get('/appointments/new',needLogin,async(req,res)=>{
  const doctorId=req.query.doctorId;if(!doctorId)return res.status(400).send('doctorId required');
  const d=await get(`SELECT d.id doc_id,u.name FROM doctors d JOIN users u ON u.id=d.user_id WHERE d.id=?`,[doctorId]);
  if(!d)return res.status(404).send('Doctor not found');res.render('appointment_form',{d});
});

router.post('/appointments',needLogin,async(req,res)=>{
  const {doctor_id,date,for_person_name}=req.body;
  const count=await get(`SELECT COUNT(*) c FROM appointments WHERE doctor_id=? AND date=?`,[doctor_id,date]);
  const serial=(count?.c||0)+1;
  const dur=(await get(`SELECT visit_duration_minutes v FROM doctors WHERE id=?`,[doctor_id]))?.v||10;
  const base='18:00';function addMin(t,m){let [H,M]=t.split(':').map(Number),mins=H*60+M+m;H=Math.floor(mins/60)%24;M=mins%60;return `${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}`;}
  const slot_time=addMin(base,(serial-1)*dur);
  const r=await run(`INSERT INTO appointments(doctor_id,patient_id,for_person_name,date,slot_time,serial_no,status)
    VALUES(?,?,?,?,?,?,?)`,[doctor_id,req.session.user.id,for_person_name||'',date,slot_time,serial,'booked']);
  res.redirect(`/appointments/${r.id}/confirm`);
});

router.get('/appointments/:id/confirm',needLogin,async(req,res)=>{
  const a=await get(`SELECT a.*,u.name AS doc_name FROM appointments a 
    JOIN doctors d ON d.id=a.doctor_id JOIN users u ON u.id=d.user_id WHERE a.id=?`,[req.params.id]);
  if(!a)return res.status(404).send('Not found');res.render('appointment_confirm',{a});
});

router.get('/appointments/:id/status',needLogin,async(req,res)=>{
  const a=await get(`SELECT a.*,d.visit_duration_minutes v FROM appointments a JOIN doctors d ON d.id=a.doctor_id WHERE a.id=?`,[req.params.id]);
  if(!a)return res.status(404).send('Not found');
  const ahead=(await get(`SELECT COUNT(*) c FROM appointments WHERE doctor_id=? AND date=? AND serial_no < ?`,
    [a.doctor_id,a.date,a.serial_no]))?.c||0;
  const etaMin=a.v*(ahead);res.render('appointment_status',{a,ahead,etaMin});
});

// NEW: pre-visit questionnaire
router.get('/appointments/:id/form',needLogin,async(req,res)=>{
  const a=await get(`SELECT * FROM appointments WHERE id=? AND patient_id=?`,[req.params.id,req.session.user.id]);
  if(!a)return res.status(404).send('Not found');res.render('appointment_questionnaire',{a});
});
router.post('/appointments/:id/form',needLogin,async(req,res)=>{
  const a=await get(`SELECT * FROM appointments WHERE id=? AND patient_id=?`,[req.params.id,req.session.user.id]);
  if(!a)return res.status(404).send('Not found');
  const payload={chief_complaint:req.body.chief_complaint||'',duration:req.body.duration||'',allergies:req.body.allergies||''};
  await run(`INSERT INTO appointment_answers(appointment_id,answers_json) VALUES(?,?)`,[a.id,JSON.stringify(payload)]);
  res.redirect(`/appointments/${a.id}/confirm`);
});

module.exports=router;
