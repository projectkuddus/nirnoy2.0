const express=require('express');const {run,get,all:getAll}=require('../db');const PDFDocument=require('pdfkit');const router=express.Router();
const needLogin=(req,res,next)=>!req.session.user?res.redirect('/login'):next();

function genSlots(start,end,dur){
  const out=[];let [h1,m1]=start.split(':').map(Number),[h2,m2]=end.split(':').map(Number);
  let t=h1*60+m1, stop=h2*60+m2;
  while(t+dur<=stop){out.push(`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`);t+=dur;}
  return out;
}

router.get('/appointments/new',needLogin,async(req,res)=>{
  const doctorId=req.query.doctorId;if(!doctorId)return res.status(400).send('doctorId required');
  const d=await get(`SELECT d.id doc_id,u.name,d.visit_duration_minutes FROM doctors d JOIN users u ON u.id=d.user_id WHERE d.id=?`,[doctorId]);
  if(!d)return res.status(404).send('Doctor not found');
  const date=req.query.date||'';
  let available=[];
  if(date){
    const dow=new Date(date).getDay();
    const rows=await getAll(`SELECT start_time,end_time FROM schedules WHERE doctor_id=? AND day_of_week=?`,[doctorId,dow]);
    const taken=await getAll(`SELECT slot_time FROM appointments WHERE doctor_id=? AND date=?`,[doctorId,date]);
    const takenSet=new Set(taken.map(x=>x.slot_time));
    for(const r of rows){
      for(const s of genSlots(r.start_time,r.end_time,d.visit_duration_minutes||10)){
        if(!takenSet.has(s)) available.push(s);
      }
    }
  }
  res.render('appointment_form',{d,date,available});
});

router.post('/appointments',needLogin,async(req,res)=>{
  const {doctor_id,date,for_person_name,slot_time}=req.body;
  const cnt=await get(`SELECT COUNT(*) c FROM appointments WHERE doctor_id=? AND date=?`,[doctor_id,date]);
  const serial=(cnt?.c||0)+1;
  const dur=(await get(`SELECT visit_duration_minutes v FROM doctors WHERE id=?`,[doctor_id]))?.v||10;
  let finalSlot=slot_time;
  if(!finalSlot){
    const base='18:00';const add=(t,m)=>{let [H,M]=t.split(':').map(Number),mins=H*60+M+m;H=Math.floor(mins/60)%24;M=mins%60;return `${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}`;};
    finalSlot=add('18:00',(serial-1)*dur);
  }
  const r=await run(`INSERT INTO appointments(doctor_id,patient_id,for_person_name,date,slot_time,serial_no,status)
    VALUES(?,?,?,?,?,?,?)`,[doctor_id,req.session.user.id,for_person_name||'',date,finalSlot,serial,'booked']);
  res.redirect(`/appointments/${r.id}/confirm`);
});

router.get('/appointments/:id/confirm',needLogin,async(req,res)=>{
  const a=await get(`SELECT a.*,u.name AS doc_name FROM appointments a 
    JOIN doctors d ON d.id=a.doctor_id JOIN users u ON u.id=d.user_id WHERE a.id=?`,[req.params.id]);
  if(!a)return res.status(404).send('Not found');res.render('appointment_confirm',{a});
});

router.get('/appointments/:id/status',needLogin,async(req,res)=>{
  const appt=await get(`SELECT a.*, a.date AS appt_date, u.name AS doctor_name
    FROM appointments a
    JOIN doctors d ON d.id=a.doctor_id
    JOIN users u ON u.id=d.user_id
    WHERE a.id=?`,[req.params.id]);
  if(!appt)return res.status(404).send('Not found');
  res.render('appointment_status',{appt});
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

router.get('/appointments/:id/prescription.pdf', async (req,res)=>{
  if(!req.session.user) return res.redirect('/login');
  const u=req.session.user;
  const a = await get(`
    SELECT a.*, a.date AS appt_date, p.name AS patient_name, p.email AS patient_email, du.name AS doctor_name
    FROM appointments a
    JOIN users p ON p.id=a.patient_id
    JOIN doctors d ON d.id=a.doctor_id
    JOIN users du ON du.id=d.user_id
    WHERE a.id=?`, [req.params.id]);
  if(!a) return res.status(404).send('Not found');
  if(!(u.role==='admin' || u.id===a.patient_id || u.id===a.doctor_id)) return res.status(403).send('Not allowed');
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=nirnoy_prescription_${a.id}.pdf`);
  const doc=new PDFDocument({margin:36}); doc.pipe(res);
  doc.fontSize(18).text('Nirnoy — Prescription',{align:'center'}); doc.moveDown();
  doc.fontSize(12)
     .text(`Doctor: ${a.doctor_name}`)
     .text(`Patient: ${a.patient_name}${a.patient_email?` (${a.patient_email})`:''}`)
     .text(`Date: ${a.appt_date}   Time: ${a.slot_time}`); doc.moveDown();
  if(a.diagnosis){ doc.font('Helvetica-Bold').text('Diagnosis'); doc.font('Helvetica').text(a.diagnosis).moveDown(); }
  if(a.prescription_text){ doc.font('Helvetica-Bold').text('Prescription'); doc.font('Helvetica').text(a.prescription_text).moveDown(); }
  if(a.advice){ doc.font('Helvetica-Bold').text('Advice'); doc.font('Helvetica').text(a.advice).moveDown(); }
  doc.moveDown().fontSize(10).text('Generated by Nirnoy 2.0', {align:'right'});
  doc.end();
});

router.get('/appointments/:id/eta.json', needLogin, async (req,res)=>{
  const u=req.session.user;
  const a = await get(`
    SELECT a.*, a.date AS appt_date, d.running_late_minutes, d.visit_duration_minutes, d.user_id AS doctor_user_id
    FROM appointments a
    JOIN doctors d ON d.id=a.doctor_id
    WHERE a.id=?`, [req.params.id]);
  if(!a) return res.status(404).json({error:'not found'});
  if(!(u.role==='admin'||u.id===a.patient_id||u.id===a.doctor_user_id)) return res.status(403).json({error:'not allowed'});
  const rows = await getAll(`
    SELECT id, slot_time, status
    FROM appointments
    WHERE doctor_id=? AND date=?
    ORDER BY slot_time ASC
  `,[a.doctor_id, a.appt_date]);
  const duration = a.visit_duration_minutes ?? 15;
  const late = a.running_late_minutes ?? 0;
  let before = 0;
  for(const r of rows){
    if(r.id===a.id) break;
    if(['done','no_show'].includes(r.status)) continue;
    before++;
  }
  let etaMin = 0;
  if(a.status==='done' || a.status==='no_show') etaMin = 0;
  else if(a.status==='in_progress') etaMin = 0;
  else if(a.status==='called') etaMin = late;
  else etaMin = before*duration + late;
  res.json({status:a.status, eta_min:etaMin, position:before});
});

module.exports=router;
