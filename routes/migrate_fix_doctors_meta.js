const express=require('express');
const {run}=require('../db');
const router=express.Router();

router.get('/migrate/fix-doctors-meta',async(_req,res)=>{
  try{await run('ALTER TABLE doctors ADD COLUMN specialty TEXT');}catch(_){}
  try{await run('ALTER TABLE doctors ADD COLUMN area TEXT');}catch(_){}
  try{await run('ALTER TABLE doctors ADD COLUMN fee TEXT');}catch(_){}
  return res.render('notice',{title:'Migration OK',message:'Added doctors.specialty, area, fee. You can refresh /doctors now.'});
});

module.exports=router;
