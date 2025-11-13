const express=require('express');
const {get,all,run}=require('../db');
const router=express.Router();

function needAdmin(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='admin') return res.status(403).send('Admin only');
  next();
}

async function ensureDoctorRow(user_id){
  const d=await get(`SELECT * FROM doctors WHERE user_id=?`,[user_id]);
  if(!d){
    await run(`INSERT INTO doctors(user_id,bmdc_no,specialty,area,fee,visit_duration_minutes,running_late_minutes)
               VALUES(?,?,?,?,?,?,?)`,[user_id,'','','',null,15,0]);
  }
}

router.get('/admin/seed', async (req,res)=>{
  const bcrypt=require('bcryptjs');
  const existing=await get(`SELECT * FROM users WHERE email='admin@nirnoy.local'`);
  if(!existing){
    const hash=await bcrypt.hash('admin123',10);
    await run(`INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)`,
      ['Admin','admin@nirnoy.local',hash,'admin','approved']);
  }
  res.render('notice',{title:'Seeded',message:'Admin created: admin@nirnoy.local / admin123'});
});

router.get('/admin/doctors', needAdmin, async (_req,res)=>{
  const pending = await all(`
    SELECT u.id AS uid,u.name,u.email,u.status,
           COALESCE(d.bmdc_no,'') bmdc_no, COALESCE(d.specialty,'') specialty,
           COALESCE(d.area,'') area, COALESCE(d.fee,'') fee,
           COALESCE(d.visit_duration_minutes,15) visit_duration_minutes
    FROM users u
    LEFT JOIN doctors d ON d.user_id=u.id
    WHERE u.role='doctor' AND u.status!='approved'
    ORDER BY u.name
  `);
  const approved = await all(`
    SELECT u.id AS uid,u.name,u.email,u.status,
           COALESCE(d.bmdc_no,'') bmdc_no, COALESCE(d.specialty,'') specialty,
           COALESCE(d.area,'') area, COALESCE(d.fee,'') fee,
           COALESCE(d.visit_duration_minutes,15) visit_duration_minutes
    FROM users u
    LEFT JOIN doctors d ON d.user_id=u.id
    WHERE u.role='doctor' AND u.status='approved'
    ORDER BY u.name
  `);
  res.render('admin_doctors',{pending,approved});
});

router.post('/admin/doctors/:uid/approve', needAdmin, async (req,res)=>{
  const uid=parseInt(req.params.uid,10);
  await run(`UPDATE users SET status='approved' WHERE id=?`,[uid]);
  await ensureDoctorRow(uid);
  req.session.flash={type:'ok',msg:'Doctor approved'};
  res.redirect('/admin/doctors');
});

router.post('/admin/doctors/:uid/reject', needAdmin, async (req,res)=>{
  const uid=parseInt(req.params.uid,10);
  await run(`UPDATE users SET status='rejected' WHERE id=?`,[uid]);
  req.session.flash={type:'ok',msg:'Doctor rejected'};
  res.redirect('/admin/doctors');
});

router.post('/admin/doctors/:uid/update', needAdmin, async (req,res)=>{
  const uid=parseInt(req.params.uid,10);
  await ensureDoctorRow(uid);
  const fee = req.body.fee? parseInt(req.body.fee,10): null;
  const dur = req.body.visit_duration_minutes? Math.max(5, parseInt(req.body.visit_duration_minutes,10)||15): 15;
  await run(`UPDATE doctors SET bmdc_no=?, specialty=?, area=?, fee=?, visit_duration_minutes=? WHERE user_id=?`,
            [req.body.bmdc_no||'', req.body.specialty||'', req.body.area||'', fee, dur, uid]);
  req.session.flash={type:'ok',msg:'Doctor details saved'};
  res.redirect('/admin/doctors');
});

module.exports=router;
