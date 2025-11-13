const express=require('express');
const path=require('path');
const fs=require('fs');
const multer=require('multer');
const {get,run}=require('../db');

const router=express.Router();
function requireDoctor(req,res,next){if(!req.session.user||req.session.user.role!=='doctor')return res.redirect('/login');next();}

const uploadDir=path.join(__dirname,'..','uploads','doctors');
fs.mkdirSync(uploadDir,{recursive:true});
const storage=multer.diskStorage({
  destination:(_req,_file,cb)=>cb(null,uploadDir),
  filename:(req,file,cb)=>cb(null,`doc_${req.session.user.id}_${Date.now()}${path.extname(file.originalname||'.jpg')}`)
});
const upload=multer({storage});

router.get('/doctor/photo',requireDoctor,async(req,res)=>{
  const doc=await get('SELECT d.*, u.name FROM doctors d JOIN users u ON u.id=d.user_id WHERE u.id=?',[req.session.user.id]);
  return res.render('doctor_photo',{title:'Doctor Photo',doc});
});

router.post('/doctor/photo',requireDoctor,upload.single('photo'),async(req,res)=>{
  const rel=`/uploads/doctors/${path.basename(req.file.path)}`;
  await run('UPDATE doctors SET photo_url=? WHERE user_id=?',[rel,req.session.user.id]);
  res.redirect('/doctor/photo');
});

module.exports=router;
