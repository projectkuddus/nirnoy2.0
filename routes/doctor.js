const express=require('express');const bcrypt=require('bcryptjs');
const {run,get}=require('../db');const router=express.Router();
router.get('/doctor/register',(req,res)=>res.render('doctor_register'));
router.post('/doctor/register',async(req,res)=>{try{
  const {name,email,password,bmdc_no,specialty,chamber}=req.body;
  const e=await get('SELECT id FROM users WHERE email=?',[email]);if(e)return res.status(400).send('Email already registered');
  const h=await bcrypt.hash(password,10);
  const r=await run(`INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)`,
    [name||'',email,h,'doctor','pending']);
  await run(`INSERT INTO doctors(user_id,bmdc_no,specialty,chamber) VALUES(?,?,?,?)`,
    [r.id,bmdc_no||'',specialty||'',chamber||'']);
  res.send('Doctor registered. Await admin approval.');}catch(_){res.status(500).send('Doctor register error');}});
module.exports=router;
