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
const imageAllowed=/\.(jpg|jpeg|png)$/i;
const upload=multer({
  storage,
  limits:{fileSize:5*1024*1024},
  fileFilter:(_req,file,cb)=>{
    const mime=(file.mimetype||'').toLowerCase();
    const name=file.originalname||'';
    if(mime.startsWith('image/')&&imageAllowed.test(name)) return cb(null,true);
    cb(new Error('Only JPG/PNG images up to 5MB are allowed'));
  }
});

router.get('/doctor/photo',requireDoctor,async(req,res)=>{
  const doc=await get('SELECT d.*, u.name FROM doctors d JOIN users u ON u.id=d.user_id WHERE u.id=?',[req.session.user.id]);
  return res.render('doctor_photo',{title:'Doctor Photo',doc});
});

router.post('/doctor/photo',requireDoctor,(req,res,next)=>{
  upload.single('photo')(req,res,async(err)=>{
    if(err){
      req.session.flash={type:'err',msg:err.message||'Upload failed'};
      return res.redirect('/doctor/photo');
    }
    if(!req.session||!req.body||req.body._csrf!==req.session.csrfToken){
      req.session.flash={type:'err',msg:'Invalid CSRF token'};
      return res.status(403).send('Invalid CSRF token');
    }
    if(!req.file){
      req.session.flash={type:'err',msg:'Please select a photo'};
      return res.redirect('/doctor/photo');
    }
    try{
      const rel=`/uploads/doctors/${path.basename(req.file.path)}`;
      await run('UPDATE doctors SET photo_url=? WHERE user_id=?',[rel,req.session.user.id]);
      res.redirect('/doctor/photo');
    }catch(e){
      next(e);
    }
  });
});

module.exports=router;
