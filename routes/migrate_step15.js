const express=require('express'); const {run}=require('../db');
const router=express.Router();

router.get('/migrate/step15', async (_req,res)=>{
  await run(`CREATE TABLE IF NOT EXISTS doctor_clinics(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    area TEXT,
    address TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  try{ await run(`ALTER TABLE doctor_schedule ADD COLUMN clinic_id INTEGER`);}catch(_){}
  try{ await run(`ALTER TABLE appointments ADD COLUMN clinic_id INTEGER`);}catch(_){}
  await run(`
    INSERT INTO doctor_clinics(doctor_id,name,area,address)
    SELECT d.user_id, 'Primary Clinic', COALESCE(d.area,''), ''
    FROM doctors d
    WHERE d.user_id NOT IN (SELECT doctor_id FROM doctor_clinics)
  `);
  await run(`
    UPDATE doctor_schedule
    SET clinic_id = (
      SELECT MIN(c.id) FROM doctor_clinics c
      WHERE c.doctor_id = doctor_schedule.doctor_id
    )
    WHERE clinic_id IS NULL
  `);
  await run(`
    UPDATE appointments
    SET clinic_id = (
      SELECT MIN(c.id) FROM doctor_clinics c
      WHERE c.doctor_id = appointments.doctor_id
    )
    WHERE clinic_id IS NULL
  `);
  res.render('notice',{title:'Migration OK',message:'Step 15: clinics + per-clinic schedule + clinic_id on appointments ready.'});
});

module.exports=router;
