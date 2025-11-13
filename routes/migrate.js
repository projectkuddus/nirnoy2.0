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
