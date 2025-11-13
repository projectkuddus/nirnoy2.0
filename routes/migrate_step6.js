const express=require('express'); const {run}=require('../db');
const router=express.Router();

router.get('/migrate/step6', async (_req,res)=>{
  const alters=[
    "ALTER TABLE doctors ADD COLUMN specialty TEXT",
    "ALTER TABLE doctors ADD COLUMN area TEXT",
    "ALTER TABLE doctors ADD COLUMN fee INTEGER"
  ];
  for (const sql of alters){ try{ await run(sql);}catch(_){/* already exists */} }
  res.render('notice',{title:'Migration OK',message:'Step 6: specialty/area/fee columns ready.'});
});

module.exports=router;
