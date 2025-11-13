const express=require('express'),path=require('path'),fs=require('fs');
const multer=require('multer'); const {get,all,run}=require('../db');
const router=express.Router();

const UP=path.join(__dirname,'..','uploads','reports'); fs.mkdirSync(UP,{recursive:true});
const storage=multer.diskStorage({
  destination:(req,file,cb)=>cb(null,UP),
  filename:(req,file,cb)=>cb(null, Date.now()+'_'+Math.round(Math.random()*1e6)+path.extname(file.originalname||'')),
});
const allowed=/pdf|jpg|jpeg|png/;
const upload=multer({storage,fileFilter:(req,file,cb)=>{
  (allowed.test((file.mimetype||'').toLowerCase())||allowed.test((file.originalname||'').toLowerCase()))?cb(null,true):cb(new Error('Only PDF/JPG/PNG'));
}});

async function canView(u, apptId){
  const a=await get(`SELECT * FROM appointments WHERE id=?`,[apptId]);
  if(!a) return null;
  if(u.role==='admin'||u.id===a.patient_id||u.id===a.doctor_id) return a;
  return null;
}

router.get('/appointments/:id/files', async (req,res)=>{
  if(!req.session.user) return res.redirect('/login');
  const a=await canView(req.session.user, req.params.id); if(!a) return res.status(403).send('Not allowed');
  const rows=await all(`SELECT * FROM appointment_files WHERE appointment_id=? ORDER BY id DESC`,[a.id]);
  res.render('appointment_files',{a,rows});
});

router.post('/appointments/:id/upload', upload.single('file'), async (req,res)=>{
  if(!req.session.user) return res.redirect('/login');
  const a=await canView(req.session.user, req.params.id); if(!a) return res.status(403).send('Not allowed');
  if(!req.file){ req.session.flash={type:'err',msg:'File required'}; return res.redirect(`/appointments/${req.params.id}/files`); }
  const fileUrl='/uploads/reports/'+req.file.filename;
  await run(`INSERT INTO appointment_files(appointment_id,uploader_id,kind,note,filepath) VALUES(?,?,?,?,?)`,
            [a.id, req.session.user.id, req.body.kind||'report', req.body.note||'', fileUrl]);
  req.session.flash={type:'ok',msg:'File uploaded'};
  res.redirect(`/appointments/${a.id}/files`);
});

router.post('/appointments/:id/files/:fid/review', async (req,res)=>{
  if(!req.session.user) return res.redirect('/login');
  const a=await canView(req.session.user, req.params.id); if(!a) return res.status(403).send('Not allowed');
  if(!(req.session.user.role==='admin'||req.session.user.id===a.doctor_id)) return res.status(403).send('Doctor/admin only');
  await run(`UPDATE appointment_files SET reviewed=1 WHERE id=? AND appointment_id=?`,[req.params.fid,a.id]);
  res.redirect(`/appointments/${a.id}/files`);
});

module.exports=router;
