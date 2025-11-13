const express=require('express'); const {all,get,run}=require('../db');
const router=express.Router();

function needDoctor(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='doctor') return res.status(403).send('Doctor only');
  next();
}

router.get('/doctor/clinics', needDoctor, async (req,res)=>{
  const rows=await all(`SELECT * FROM doctor_clinics WHERE doctor_id=? ORDER BY id DESC`,[req.session.user.id]);
  res.render('doctor_clinics',{rows});
});
router.post('/doctor/clinics/add', needDoctor, async (req,res)=>{
  await run(`INSERT INTO doctor_clinics(doctor_id,name,area,address) VALUES(?,?,?,?)`,
    [req.session.user.id, (req.body.name||'').trim()||'Clinic', req.body.area||'', req.body.address||'']);
  res.redirect('/doctor/clinics');
});
router.post('/doctor/clinics/:id/update', needDoctor, async (req,res)=>{
  const c=await get(`SELECT * FROM doctor_clinics WHERE id=? AND doctor_id=?`,[req.params.id, req.session.user.id]);
  if(!c) return res.status(404).send('Not found');
  await run(`UPDATE doctor_clinics SET name=?, area=?, address=? WHERE id=?`,
    [req.body.name||c.name, req.body.area||c.area, req.body.address||c.address, c.id]);
  res.redirect('/doctor/clinics');
});
router.post('/doctor/clinics/:id/delete', needDoctor, async (req,res)=>{
  const cnt=await get(`SELECT COUNT(*) as n FROM appointments WHERE clinic_id=?`,[req.params.id]);
  if(cnt.n>0){ req.session.flash={type:'err',msg:'Cannot delete: clinic in use'}; return res.redirect('/doctor/clinics'); }
  await run(`DELETE FROM doctor_schedule WHERE clinic_id=?`,[req.params.id]);
  await run(`DELETE FROM doctor_clinics WHERE id=? AND doctor_id=?`,[req.params.id, req.session.user.id]);
  res.redirect('/doctor/clinics');
});

router.get('/doctor/schedule', needDoctor, async (req,res)=>{
  const clinics=await all(`SELECT * FROM doctor_clinics WHERE doctor_id=? ORDER BY id`,[req.session.user.id]);
  if(!clinics.length) return res.redirect('/doctor/clinics');
  const clinicId=parseInt(req.query.clinicId||clinics[0].id,10);
  const rows=await all(`SELECT day_of_week,start_time,end_time FROM doctor_schedule WHERE doctor_id=? AND clinic_id=? ORDER BY day_of_week`,
    [req.session.user.id, clinicId]);
  const map={}; rows.forEach(r=>map[r.day_of_week]=r);
  res.render('doctor_schedule',{clinics, clinicId, map});
});
router.post('/doctor/schedule', needDoctor, async (req,res)=>{
  const clinicId=parseInt(req.body.clinicId,10);
  await run(`DELETE FROM doctor_schedule WHERE doctor_id=? AND clinic_id=?`,[req.session.user.id, clinicId]);
  for(let d=0; d<=6; d++){
    const s=(req.body[`s_${d}`]||'').trim(), e=(req.body[`e_${d}`]||'').trim();
    if(s && e){
      await run(`INSERT INTO doctor_schedule(doctor_id,clinic_id,day_of_week,start_time,end_time) VALUES(?,?,?,?,?)`,
        [req.session.user.id, clinicId, d, s, e]);
    }
  }
  req.session.flash={type:'ok',msg:'Schedule saved'};
  res.redirect(`/doctor/schedule?clinicId=${clinicId}`);
});

module.exports=router;
