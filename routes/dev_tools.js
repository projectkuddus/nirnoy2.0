const express=require('express');
const bcrypt=require('bcryptjs');
const {get,all,run}=require('../db');
const router=express.Router();

function ok(res,msg){return res.render('notice',{title:'Dev',message:msg});}
function asEmail(s){return String(s||'').trim().toLowerCase();}

router.get('/dev/seed_admin', async (_req,res)=>{
  const email='admin@nirnoy.local', pw='admin123';
  const hash=await bcrypt.hash(pw,10);
  const u=await get(`SELECT id FROM users WHERE email=?`,[email]);
  if(!u){
    await run(`INSERT INTO users(name,email,role,password_hash,status) VALUES(?,?,?,?,?)`,
      ['Admin',email,'admin',hash,'approved']);
  }else{
    await run(`UPDATE users SET role='admin',status='approved',password_hash=? WHERE id=?`,[hash,u.id]);
  }
  return ok(res,`Admin ready → ${email} / ${pw}`);
});

router.get('/dev/setpw', async (req,res)=>{
  const email=asEmail(req.query.email), pw=String(req.query.pw||'');
  if(!email||!pw) return res.status(400).send('email & pw required');
  const hash=await bcrypt.hash(pw,10);
  await run(`UPDATE users SET password_hash=? WHERE email=?`,[hash,email]);
  return ok(res,`Password set for ${email}`);
});

router.get('/dev/promote', async (req,res)=>{
  const email=asEmail(req.query.email);
  if(!email) return res.status(400).send('email required');
  await run(`UPDATE users SET role='admin',status='approved' WHERE email=?`,[email]);
  return ok(res,`${email} is now admin`);
});

router.get('/dev/demo', async (_req,res)=>{
  const today=new Date().toISOString().slice(0,10);
  const docEmail='doc1@nirnoy.local', patEmail='pat1@nirnoy.local';
  const docPw='doc123', patPw='pat123';
  const dhash=await bcrypt.hash(docPw,10), phash=await bcrypt.hash(patPw,10);
  let du=await get(`SELECT * FROM users WHERE email=?`,[docEmail]);
  if(!du){
    await run(`INSERT INTO users(name,email,role,password_hash,status) VALUES(?,?,?,?,?)`,
      ['Dr. Demo',docEmail,'doctor',dhash,'approved']);
    du=await get(`SELECT * FROM users WHERE email=?`,[docEmail]);
  }else{
    await run(`UPDATE users SET role='doctor',status='approved',password_hash=? WHERE id=?`,[dhash,du.id]);
  }
  await run(`INSERT OR IGNORE INTO doctors(user_id,bmdc_no,specialty,area,fee,visit_duration_minutes,running_late_minutes)
             VALUES(?,?,?,?,?,?,?)`,[du.id,'BMDC-DEMO','General','Dhaka',500,15,0]);
  let pu=await get(`SELECT * FROM users WHERE email=?`,[patEmail]);
  if(!pu){
    await run(`INSERT INTO users(name,email,role,password_hash,status) VALUES(?,?,?,?,?)`,
      ['Patient Demo',patEmail,'patient',phash,'approved']);
    pu=await get(`SELECT * FROM users WHERE email=?`,[patEmail]);
  }else{
    await run(`UPDATE users SET role='patient',status='approved',password_hash=? WHERE id=?`,[phash,pu.id]);
  }
  let clinic=await get(`SELECT * FROM doctor_clinics WHERE doctor_id=? ORDER BY id LIMIT 1`,[du.id]);
  if(!clinic){
    await run(`INSERT INTO doctor_clinics(doctor_id,name,area,address) VALUES(?,?,?,?)`,
      [du.id,'Primary Clinic','Panthapath','']);
    clinic=await get(`SELECT * FROM doctor_clinics WHERE doctor_id=? ORDER BY id LIMIT 1`,[du.id]);
  }
  const dow=new Date(today).getDay();
  const srow=await get(`SELECT 1 FROM doctor_schedule WHERE doctor_id=? AND clinic_id=? AND day_of_week=?`,[du.id,clinic.id,dow]);
  if(!srow){
    await run(`INSERT INTO doctor_schedule(doctor_id,clinic_id,day_of_week,start_time,end_time)
               VALUES(?,?,?,?,?)`,[du.id,clinic.id,dow,'10:00','12:00']);
  }
  const toMin=t=>{const [h,m]=t.split(':').map(n=>parseInt(n)||0);return h*60+m;};
  const fm=m=>{const pad=x=>String(x).padStart(2,'0');return `${pad(Math.floor(m/60))}:${pad(m%60)}`;};
  const step=15,start=toMin('10:00'),end=toMin('12:00');
  const taken=new Set((await all(`SELECT slot_time FROM appointments WHERE doctor_id=? AND clinic_id=? AND appt_date=?`,
    [du.id,clinic.id,today])).map(r=>r.slot_time));
  let chosen=null;for(let t=start;t+step<=end;t+=step){const hh=fm(t);if(!taken.has(hh)){chosen=hh;break;}}
  if(!chosen) return ok(res,'Demo ready, but no free slots left.');
  const r=await run(`INSERT INTO appointments(patient_id,doctor_id,clinic_id,appt_date,slot_time,status)
                     VALUES(?,?,?,?,?,?)`,[pu.id,du.id,clinic.id,today,chosen,'queued']);
  return ok(res,`Demo created:
Admin → admin@nirnoy.local / admin123
Doctor → ${docEmail} / ${docPw}
Patient → ${patEmail} / ${patPw}
Appointment → #${r.lastID} on ${today} at ${chosen}`);
});

router.get('/dev/status', async (_req,res)=>{
  const tables=await all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
  const counts={};
  for(const t of tables){ try{const c=await get(`SELECT COUNT(*) n FROM ${t.name}`);counts[t.name]=c.n;}catch(_){}}
  return res.json({tables:tables.map(t=>t.name),counts});
});

module.exports=router;
