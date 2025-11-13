const express=require('express'); const {run}=require('../db');
const router=express.Router();

// One-time safe migration. You can hit this URL again; failures are ignored.
router.get('/migrate/step2', async (req,res)=>{
  const alters=[
    "ALTER TABLE appointments ADD COLUMN status TEXT DEFAULT 'queued'",
    "ALTER TABLE appointments ADD COLUMN called_at TEXT",
    "ALTER TABLE appointments ADD COLUMN started_at TEXT",
    "ALTER TABLE appointments ADD COLUMN finished_at TEXT",
    "ALTER TABLE appointments ADD COLUMN room TEXT DEFAULT ''"
  ];
  for(const sql of alters){ try{ await run(sql);}catch(_){/* already exists */} }
  await run("UPDATE appointments SET status='queued' WHERE status IS NULL");
  res.render('notice',{title:'Migration OK',message:'Step 2 columns added (status/timestamps/room).'});
});

module.exports=router;
