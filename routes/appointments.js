const express=require('express');const {run,get,all:getAll}=require('../db');const PDFDocument=require('pdfkit');const router=express.Router();
const needLogin=(req,res,next)=>!req.session.user?res.redirect('/login'):next();

router.get('/appointments/:id/confirm',needLogin,async(req,res)=>{
  const a=await get(`SELECT a.*,u.name AS doc_name FROM appointments a 
    JOIN doctors d ON d.id=a.doctor_id JOIN users u ON u.id=d.user_id WHERE a.id=?`,[req.params.id]);
  if(!a)return res.status(404).send('Not found');res.render('appointment_confirm',{a});
});

router.get('/appointments/:id/status',needLogin,async(req,res)=>{
  const appt=await get(`SELECT a.*, a.appt_date, u.name AS doctor_name, c.name AS clinic_name
    FROM appointments a
    JOIN doctors d ON d.id=a.doctor_id
    JOIN users u ON u.id=d.user_id
    LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
    WHERE a.id=?`,[req.params.id]);
  if(!appt)return res.status(404).send('Not found');
  res.render('appointment_status',{appt});
});
... (rest similar)
