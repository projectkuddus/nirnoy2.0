const express=require('express');const {all,get}=require('../db');
const router=express.Router();
const needLogin=(req,res,next)=>!req.session.user?res.redirect('/login'):next();

router.get('/patient/dashboard',needLogin,async(req,res)=>{
  const uid=req.session.user.id;
  const upcoming=await all(`SELECT a.*, du.name AS doc_name
    FROM appointments a JOIN doctors d ON d.id=a.doctor_id
    JOIN users du ON du.id=d.user_id
    WHERE a.patient_id=? AND a.status IN ('booked','in_progress')
    ORDER BY a.date,a.serial_no`,[uid]);
  const past=await all(`SELECT a.*, du.name AS doc_name
    FROM appointments a JOIN doctors d ON d.id=a.doctor_id
    JOIN users du ON du.id=d.user_id
    WHERE a.patient_id=? AND a.status='done'
    ORDER BY a.date DESC,a.serial_no DESC`,[uid]);
  res.render('dashboard_patient',{upcoming,past});
});

router.get('/consultations/appointment/:id',needLogin,async(req,res)=>{
  const uid=req.session.user.id;
  const a=await get(`SELECT a.*, du.name AS doc_name
    FROM appointments a JOIN doctors d ON d.id=a.doctor_id
    JOIN users du ON du.id=d.user_id
    WHERE a.id=? AND a.patient_id=?`,[req.params.id,uid]);
  if(!a) return res.status(404).send('Not found');
  const c=await get(`SELECT * FROM consultations WHERE appointment_id=?`,[a.id]);
  res.render('consultation_view',{a,cons:c});
});

module.exports=router;
