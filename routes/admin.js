const express=require('express'); const {all,get,run}=require('../db');
const router=express.Router();

// VERY simple admin gate (seed user: admin@nirnoy.local / admin123)
function needAdmin(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='admin') return res.status(403).send('Admin only');
  next();
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

router.get('/admin/doctors', needAdmin, async (req,res)=>{
  const pending=await all(`SELECT d.*, u.name, u.email FROM doctors d JOIN users u ON u.id=d.user_id WHERE u.status='pending' ORDER BY d.id DESC`);
  const approved=await all(`SELECT d.*, u.name, u.email FROM doctors d JOIN users u ON u.id=d.user_id WHERE u.status='approved' ORDER BY d.id DESC`);
  const docs={}; // proof links
  try{
    const rows=await all(`SELECT doctor_id, filepath FROM doctor_docs WHERE kind='bmdc_card'`);
    rows.forEach(r=>docs[r.doctor_id]=r.filepath);
  }catch(_){}
  res.render('admin_doctors',{pending,approved,docs});
});

router.post('/admin/doctors/:id/approve', needAdmin, async (req,res)=>{
  const d=await get(`SELECT * FROM doctors WHERE id=?`,[req.params.id]);
  if(d){ await run(`UPDATE users SET status='approved' WHERE id=?`,[d.user_id]); }
  res.redirect('/admin/doctors');
});

router.post('/admin/doctors/:id/reject', needAdmin, async (req,res)=>{
  const d=await get(`SELECT * FROM doctors WHERE id=?`,[req.params.id]);
  if(d){ await run(`UPDATE users SET status='rejected' WHERE id=?`,[d.user_id]); }
  res.redirect('/admin/doctors');
});

module.exports=router;
