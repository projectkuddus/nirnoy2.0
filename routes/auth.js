const express=require('express');const bcrypt=require('bcryptjs');
const {run,get}=require('../db');const router=express.Router();

const LOGIN_WINDOW_MS=10*60*1000;
const LOGIN_MAX_ATTEMPTS=5;
const loginAttempts=new Map();
const attemptKey=req=>{
  const ip=req.ip||req.connection?.remoteAddress||'unknown';
  const email=(req.body?.email||'').toLowerCase();
  return `${ip}:${email}`;
};
function isRateLimited(req){
  const key=attemptKey(req);
  const now=Date.now();
  let info=loginAttempts.get(key);
  if(info && info.reset<=now){loginAttempts.delete(key);info=null;}
  return !!(info && info.count>=LOGIN_MAX_ATTEMPTS);
}
function recordFailure(req){
  const key=attemptKey(req);
  const now=Date.now();
  let info=loginAttempts.get(key);
  if(!info||info.reset<=now){info={count:0,reset:now+LOGIN_WINDOW_MS};}
  info.count++;
  loginAttempts.set(key,info);
}
function clearFailures(req){
  loginAttempts.delete(attemptKey(req));
}

router.get('/register',(req,res)=>res.render('register'));
router.post('/register',async(req,res)=>{try{
  const {name,email,password}=req.body;if(!email||!password)return res.status(400).send('Email & password needed');
  const u=await get('SELECT id FROM users WHERE email=?',[email]);if(u)return res.status(400).send('Email already registered');
  const hash=await bcrypt.hash(password,10);
  const r=await run(`INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)`,
    [name||'',email,hash,'patient','active']);
  req.session.user={id:r.id,name:name||'',email,role:'patient'};res.redirect('/');}catch(e){res.status(500).send('Register error');}});
router.get('/login',(req,res)=>{
  let roleHint=null;
  const r=(req.query.role||'').toLowerCase();
  if(r==='patient'||r==='doctor'||r==='admin') roleHint=r;
  res.render('login',{roleHint});
});
router.post('/login',async(req,res)=>{try{
  if(isRateLimited(req)){
    return res.status(429).render('notice',{title:'Too many attempts',message:'Please wait a few minutes before trying again.',actions:[{href:'/login',label:'Back to login'}]});
  }
  const {email,password}=req.body;const user=await get('SELECT * FROM users WHERE email=?',[email]);
  if(!user){recordFailure(req);return res.status(400).send('Invalid credentials');}
  const ok=await bcrypt.compare(password,user.password_hash);if(!ok){recordFailure(req);return res.status(400).send('Invalid credentials');}
  clearFailures(req);
  req.session.user={id:user.id,name:user.name,email:user.email,role:user.role};res.redirect('/');}catch(e){res.status(500).send('Login error');}});
router.get('/logout',(req,res)=>{req.session.destroy(()=>res.redirect('/'));});
module.exports=router;
