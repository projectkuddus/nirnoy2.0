const express=require('express');
const path = require('path');
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

router.get('/admin/dashboard', needAdmin, async (req, res) => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);

    const [
      patientRow,
      doctorRow,
      pendingDoctorRow,
      totalApptRow,
      todayApptRow,
      upcomingApptRow,
      nirnoyDocRow,
      directoryDocRow
    ] = await Promise.all([
      get(`SELECT COUNT(*) AS count FROM users WHERE role='patient'`),
      get(`SELECT COUNT(*) AS count FROM doctors`),
      get(`SELECT COUNT(*) AS count FROM users WHERE role='doctor' AND status='pending'`),
      get(`SELECT COUNT(*) AS count FROM appointments`),
      get(`SELECT COUNT(*) AS count FROM appointments WHERE appt_date = ?`, [todayStr]),
      get(`SELECT COUNT(*) AS count FROM appointments WHERE appt_date > ?`, [todayStr]),
      get(`SELECT COUNT(*) AS count FROM doctors WHERE source = 'nirnoy'`),
      get(`SELECT COUNT(*) AS count FROM doctor_directory`)
    ]);

    const metrics = {
      totalPatients: patientRow?.count || 0,
      totalDoctors: doctorRow?.count || 0,
      nirnoyDoctors: nirnoyDocRow?.count || 0,
      directoryDoctors: directoryDocRow?.count || 0,
      pendingDoctors: pendingDoctorRow?.count || 0,
      totalAppointments: totalApptRow?.count || 0,
      todaysAppointments: todayApptRow?.count || 0,
      upcomingAppointments: upcomingApptRow?.count || 0
    };

    res.render('dashboard_admin', { metrics });
  } catch (err) {
    console.error('Error loading admin dashboard', err);
    res.status(500).render('500', { message: 'Failed to load admin dashboard.' });
  }
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

router.get('/admin/appointments', needAdmin, async (req, res) => {
  try {
    const appointments = await all(`
      SELECT
        a.*,
        du.name AS doctor_name,
        du.email AS doctor_email,
        pu.name AS patient_name,
        pu.email AS patient_email,
        c.name AS clinic_name,
        c.area AS clinic_area
      FROM appointments a
      JOIN users du ON du.id = a.doctor_id
      JOIN users pu ON pu.id = a.patient_id
      LEFT JOIN doctor_clinics c ON c.id = a.clinic_id
      ORDER BY a.appt_date DESC, a.slot_time DESC, a.id DESC
      LIMIT 200
    `);

    res.render('admin_appointments', { appointments });
  } catch (err) {
    console.error('Error loading admin appointments', err);
    res.status(500).render('500', {
      message: 'Failed to load appointments.'
    });
  }
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

router.get('/admin/backup', needAdmin, (req, res, next) => {
  try {
    const dbPath = path.join(__dirname, '..', 'nirnoy.db');
    const fileName = `nirnoy_backup_${new Date().toISOString().slice(0,10)}.db`;

    res.download(dbPath, fileName, (err) => {
      if (err) {
        return next(err);
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports=router;
