const express=require('express'); const {run}=require('../db');
const router=express.Router();

router.get('/migrate/step9', async (_req,res)=>{
  const alters=[
    "ALTER TABLE doctors ADD COLUMN intake_json TEXT"
  ];
  for(const sql of alters){ try{ await run(sql);}catch(_){/* exists */} }

  await run(`CREATE TABLE IF NOT EXISTS appointment_intake(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL,
    answers_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  res.render('notice',{title:'Migration OK',message:'Step 9: doctor intake + appointment_intake ready.'});
});

module.exports=router;
