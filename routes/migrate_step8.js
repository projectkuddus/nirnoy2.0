const express=require('express'); const {run}=require('../db');
const router=express.Router();

router.get('/migrate/step8', async (_req,res)=>{
  const alters=[
    "ALTER TABLE doctors ADD COLUMN visit_duration_minutes INTEGER",
    "ALTER TABLE doctors ADD COLUMN running_late_minutes INTEGER DEFAULT 0"
  ];
  for(const sql of alters){ try{ await run(sql);}catch(_){ /* already exists */ } }
  try{ await run(`UPDATE doctors SET visit_duration_minutes=COALESCE(visit_duration_minutes,15)`); }catch(_){}
  try{ await run(`UPDATE doctors SET running_late_minutes=COALESCE(running_late_minutes,0)`); }catch(_){}
  res.render('notice',{title:'Migration OK',message:'Step 8: visit duration + running late ready.'});
});

module.exports=router;
