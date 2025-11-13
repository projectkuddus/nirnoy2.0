const express=require('express'); const {run}=require('../db');
const router=express.Router();

router.get('/migrate/step4', async (req,res)=>{
  const alters=[
    "ALTER TABLE appointments ADD COLUMN diagnosis TEXT",
    "ALTER TABLE appointments ADD COLUMN prescription_text TEXT",
    "ALTER TABLE appointments ADD COLUMN advice TEXT"
  ];
  for (const sql of alters){ try{ await run(sql);}catch(_){/* already exists */} }
  res.render('notice',{title:'Migration OK',message:'Step 4: diagnosis/prescription/advice columns ready.'});
});

module.exports=router;
