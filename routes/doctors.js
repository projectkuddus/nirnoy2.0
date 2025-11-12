const express=require('express');const {all,get}=require('../db');const router=express.Router();
router.get('/doctors',async(req,res)=>{const rows=await all(`
  SELECT u.id user_id,u.name,u.email,d.id doc_id,d.specialty,d.chamber
  FROM users u JOIN doctors d ON d.user_id=u.id
  WHERE u.role='doctor' AND u.status='approved' ORDER BY u.id DESC`);res.render('doctors_list',{rows});});
router.get('/doctors/:docId',async(req,res)=>{const d=await get(`
  SELECT u.name,u.email,d.id doc_id,d.specialty,d.chamber,d.visit_duration_minutes
  FROM users u JOIN doctors d ON d.user_id=u.id WHERE d.id=?`,[req.params.docId]);
  if(!d) return res.status(404).send('Doctor not found');res.render('doctor_detail',{d});});
module.exports=router;
