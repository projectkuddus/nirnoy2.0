const express=require('express'); const {run}=require('../db');
const router=express.Router();
router.get('/migrate/step5', async (_req,res)=>{
  await run(`CREATE TABLE IF NOT EXISTS appointment_files(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    appointment_id INTEGER NOT NULL,
    uploader_id INTEGER NOT NULL,
    kind TEXT DEFAULT 'report',
    note TEXT DEFAULT '',
    filepath TEXT NOT NULL,
    reviewed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  res.render('notice',{title:'Migration OK',message:'Step 5: appointment_files ready.'});
});
module.exports=router;
