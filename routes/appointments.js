const express=require('express');
const router=express.Router();
const { all, get, run } = require('../db');

function needLogin(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  next();
}

router.get('/appointments/:id/status', needLogin, async (req, res) => {
  const appt = await get(`
    SELECT a.*, du.name AS doctor_name, c.name AS clinic_name
    FROM appointments a
    JOIN users du ON du.id=a.doctor_id
    LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
    WHERE a.id=?`, [req.params.id]);
  if (!appt) return res.status(404).send('Not found');
  const u = req.session.user;
  if (!(u.role==='admin' || u.id===appt.patient_id || u.id===appt.doctor_id))
    return res.status(403).send('Not allowed');
  res.render('appointment_status',{appt});
});

router.get('/appointments/:id/eta.json', needLogin, async (req,res)=>{
  const a = await get(`
    SELECT a.*, d.running_late_minutes, d.visit_duration_minutes
    FROM appointments a
    JOIN doctors d ON d.user_id=a.doctor_id
    WHERE a.id=?`, [req.params.id]);
  if(!a) return res.status(404).json({error:'not found'});

  const rows = await all(`
    SELECT id, slot_time, status
    FROM appointments
    WHERE doctor_id=? AND appt_date=?
    ORDER BY slot_time ASC
  `,[a.doctor_id, a.appt_date]);

  const duration = a.visit_duration_minutes ?? 15;
  const late = a.running_late_minutes ?? 0;

  let before = 0;
  for (const r of rows) {
    if (r.id === a.id) break;
    if (['done','no_show'].includes(r.status)) continue;
    before++;
  }

  let etaMin = 0;
  if (a.status==='done' || a.status==='no_show') etaMin=0;
  else if (a.status==='in_progress') etaMin=0;
  else if (a.status==='called') etaMin=late;
  else etaMin = before*duration + late;

  res.json({ status:a.status, eta_min:etaMin, position:before });
});

router.get('/appointments/:id/print', needLogin, async (req,res)=>{
  const appt=await get(`
    SELECT a.*, 
           du.name AS doctor_name, du.email AS doctor_email,
           pu.name AS patient_name, pu.email AS patient_email,
           c.name AS clinic_name,
           doc.running_late_minutes
    FROM appointments a
    JOIN users du ON du.id=a.doctor_id
    JOIN users pu ON pu.id=a.patient_id
    LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
    LEFT JOIN doctors doc ON doc.user_id=a.doctor_id
    WHERE a.id=?`,[req.params.id]);
  if(!appt) return res.status(404).send('Not found');
  const u=req.session.user;
  if(!(u.role==='admin'||u.id===appt.patient_id||u.id===appt.doctor_id)) return res.status(403).send('Not allowed');

  const intakeRow=await get(`SELECT answers_json FROM appointment_intake WHERE appointment_id=? ORDER BY id DESC LIMIT 1`,[appt.id]);
  let intakeAnswers=[];
  if(intakeRow?.answers_json){
    try{
      const parsed=JSON.parse(intakeRow.answers_json);
      if(Array.isArray(parsed)){
        intakeAnswers=parsed.map((item,idx)=>{
          if(item && typeof item==='object' && 'question' in item){
            return {question:item.question,answer:item.answer||item.response||''};
          }
          return {question:`Question ${idx+1}`,answer:item};
        });
      }else if(parsed && typeof parsed==='object'){
        intakeAnswers=Object.keys(parsed).map(key=>({question:key,answer:parsed[key]}));
      }
    }catch(_){}
  }

  const consult=await get(`SELECT * FROM consultations WHERE appointment_id=?`,[appt.id]);
  const files=await all(`SELECT id, kind, note, filepath, created_at FROM appointment_files WHERE appointment_id=? ORDER BY id DESC`,[appt.id]);

  res.render('appointments/print',{
    appt,
    intakeAnswers,
    consult,
    files
  });
});

module.exports=router;
