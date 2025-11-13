const express=require('express');
const bcrypt=require('bcryptjs');
const {get,all,run}=require('../db');
const router=express.Router();

async function getUserByEmail(email){ return await get(`SELECT * FROM users WHERE email=?`,[email]); }
async function ensureUser({name,email,role,status='approved',password='pass123'}){
  let u=await getUserByEmail(email);
  const hash=await bcrypt.hash(password,10);
  if(!u){
    await run(`INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)`,
      [name,email,hash,role,status]);
    u=await getUserByEmail(email);
  }else{
    await run(`UPDATE users SET role=?, status=?, password_hash=? WHERE id=?`,[role,status,hash,u.id]);
    u=await getUserByEmail(email);
  }
  return u;
}
async function ensureDoctor(user_id,{bmdc_no,specialty,area,fee}){
  let d=await get(`SELECT * FROM doctors WHERE user_id=?`,[user_id]);
  if(!d){
    await run(`INSERT INTO doctors(user_id,bmdc_no,specialty,area,fee) VALUES(?,?,?,?,?)`,
      [user_id,bmdc_no||'',specialty||'',area||'',fee||null]);
    d=await get(`SELECT * FROM doctors WHERE user_id=?`,[user_id]);
  }else{
    await run(`UPDATE doctors SET bmdc_no=?, specialty=?, area=?, fee=? WHERE id=?`,
      [bmdc_no||'',specialty||'',area||'',fee||null,d.id]);
    d=await get(`SELECT * FROM doctors WHERE user_id=?`,[user_id]);
  }
  return d;
}
async function ensureSchedule(doctor_user_id){
  const rows=await all(`SELECT * FROM doctor_schedule WHERE doctor_id=?`,[doctor_user_id]);
  if(rows.length) return;
  const days=[1,2,3,4,5];
  for(const day of days){
    await run(`INSERT INTO doctor_schedule(doctor_id,day_of_week,start_time,end_time) VALUES(?,?,?,?)`,
      [doctor_user_id,day,'10:00','12:00']);
  }
  try{ await run(`UPDATE doctors SET visit_duration_minutes=15 WHERE user_id=?`,[doctor_user_id]); }catch(_){}
}

router.get('/dev/seed-demo', async (req,res)=>{
  await ensureUser({name:'Admin',email:'admin@nirnoy.local',role:'admin',status:'approved',password:'admin123'});
  const dr1=await ensureUser({name:'Dr. Anis Khan',email:'dr.khan@nirnoy.local',role:'doctor',password:'pass123'});
  const dr2=await ensureUser({name:'Dr. R. Rahman',email:'dr.rahman@nirnoy.local',role:'doctor',password:'pass123'});
  await ensureDoctor(dr1.id,{bmdc_no:'A-12345',specialty:'Cardiology',area:'Dhanmondi',fee:700});
  await ensureDoctor(dr2.id,{bmdc_no:'B-67890',specialty:'Dermatology',area:'Gulshan',fee:600});
  await ensureSchedule(dr1.id);
  await ensureSchedule(dr2.id);
  await ensureUser({name:'Test Patient',email:'patient1@nirnoy.local',role:'patient',password:'pass123'});

  res.render('notice',{
    title:'Demo data ready',
    message:'2 doctors + 1 patient created. Use the links below.',
    actions:[
      {label:'Open Doctors', href:'/doctors'},
      {label:'Login (patient)', href:'/login'},
      {label:'Home', href:'/'}
    ]
  });
});

module.exports=router;
