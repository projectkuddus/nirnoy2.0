const express=require('express');
const { run, get } = require('../db');
const path=require('path'); const multer=require('multer');

const router=express.Router();
const storage=multer.diskStorage({
  destination:(req,file,cb)=>cb(null, path.join(__dirname,'..','uploads')),
  filename:(req,file,cb)=>{
    const safe=file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_');
    cb(null, Date.now() + '_' + safe);
  }
});
const upload=multer({storage});

router.get('/doctor/register',(req,res)=>res.render('doctor_register'));

router.post('/doctor/register', upload.single('bmdc_card'), async (req,res)=>{
  if(!req.session||!req.body||req.body._csrf!==req.session.csrfToken) return res.status(403).send('Invalid CSRF token');
  try{
    const {name,email,password,bmdc_no,specialty,chamber,visit_duration_minutes,phone}=req.body;
    if(!name||!email||!password||!bmdc_no) return res.status(400).send('Missing fields');
    // make or reuse a user
    const exists=await get('SELECT id FROM users WHERE email=?',[email]);
    if(exists) return res.status(400).send('Email already registered. Please login.');
    // very simple hash substitute for MVP (bcrypt already installed but we keep it simple here)
    const bcrypt=require('bcryptjs'); const hash=await bcrypt.hash(password,10);
    const u=await run(`INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)`,
      [name,email,hash,'doctor','pending']);
    const doc=await run(`INSERT INTO doctors(user_id,bmdc_no,specialty,chamber,visit_duration_minutes,max_per_day) VALUES(?,?,?,?,?,?)`,
      [u.id,bmdc_no,specialty||'',chamber||'',parseInt(visit_duration_minutes||'10',10),40]);
    // store upload path (relative)
    if(req.file){
      await run(`CREATE TABLE IF NOT EXISTS doctor_docs(id INTEGER PRIMARY KEY AUTOINCREMENT, doctor_id INTEGER, kind TEXT, filepath TEXT, uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
      await run(`INSERT INTO doctor_docs(doctor_id,kind,filepath) VALUES(?,?,?)`,[doc.id,'bmdc_card','/uploads/'+req.file.filename]);
    }
    res.render('notice',{title:'Submitted',message:'Registration received. Admin will verify your BMDC and approve.'});
  }catch(e){ res.status(500).send('Error: '+e.message); }
});

module.exports=router;
