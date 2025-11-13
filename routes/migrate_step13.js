const express=require('express');
const {run}=require('../db');
const router=express.Router();

router.get('/migrate/step13',async(_req,res)=>{
  try{await run('ALTER TABLE doctors ADD COLUMN photo_url TEXT');}catch(_){}
  return res.render('notice',{title:'Migration',message:'Step13 done (photo_url). Go to /doctor/photo to upload.'});
});

module.exports=router;
