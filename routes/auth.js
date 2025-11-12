const express=require('express');const bcrypt=require('bcryptjs');
const {run,get}=require('../db');const router=express.Router();
router.get('/register',(req,res)=>res.render('register'));
router.post('/register',async(req,res)=>{try{
  const {name,email,password}=req.body;if(!email||!password)return res.status(400).send('Email & password needed');
  const u=await get('SELECT id FROM users WHERE email=?',[email]);if(u)return res.status(400).send('Email already registered');
  const hash=await bcrypt.hash(password,10);
  const r=await run(`INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)`,
    [name||'',email,hash,'patient','active']);
  req.session.user={id:r.id,name:name||'',email,role:'patient'};res.redirect('/');}catch(e){res.status(500).send('Register error');}});
router.get('/login',(req,res)=>res.render('login'));
router.post('/login',async(req,res)=>{try{
  const {email,password}=req.body;const user=await get('SELECT * FROM users WHERE email=?',[email]);
  if(!user)return res.status(400).send('Invalid credentials');
  const ok=await bcrypt.compare(password,user.password_hash);if(!ok)return res.status(400).send('Invalid credentials');
  req.session.user={id:user.id,name:user.name,email:user.email,role:user.role};res.redirect('/');}catch(e){res.status(500).send('Login error');}});
router.get('/logout',(req,res)=>{req.session.destroy(()=>res.redirect('/'));});
module.exports=router;
