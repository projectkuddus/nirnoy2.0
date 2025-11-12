const express=require('express');const bcrypt=require('bcryptjs');
const {run,all,get}=require('../db');const router=express.Router();
const requireAdmin=(req,res,next)=>(!req.session.user||req.session.user.role!=='admin')?res.status(403).send('Admins only'):next();
router.get('/admin/seed',async(req,res)=>{const u=await get("SELECT id FROM users WHERE email='admin@nirnoy.local'");
  if(!u){const h=await bcrypt.hash('admin123',10);await run(
    `INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)`,
    ['Admin','admin@nirnoy.local',h,'admin','active']);}
  res.send('Admin seeded. Login: admin@nirnoy.local / admin123');});
router.get('/admin/doctors',requireAdmin,async(req,res)=>{const rows=await all(`
  SELECT u.id user_id,u.name,u.email,u.status,d.bmdc_no,d.specialty,d.chamber
  FROM users u LEFT JOIN doctors d ON d.user_id=u.id
  WHERE u.role='doctor' ORDER BY u.status DESC,u.id DESC`);res.render('admin_doctors',{rows});});
router.post('/admin/doctors/:uid/approve',requireAdmin,async(req,res)=>{await run(`UPDATE users SET status='approved' WHERE id=?`,[req.params.uid]);res.redirect('/admin/doctors');});
router.post('/admin/doctors/:uid/reject',requireAdmin,async(req,res)=>{await run(`UPDATE users SET status='rejected' WHERE id=?`,[req.params.uid]);res.redirect('/admin/doctors');});
module.exports=router;
