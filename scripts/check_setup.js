const { all, get } = require('../db');
const fs = require('fs');
const path = require('path');

(async ()=>{
  const mustFiles = [
    'server.js','db.js',
    'routes/auth.js','routes/doctors.js','routes/patients.js',
    'routes/appointments.js','routes/admin_manage.js','routes/booking.js',
    'routes/clinics.js','routes/dev_tools.js',
    'views/home.ejs','views/doctors_list.ejs','views/doctor_detail.ejs',
    'views/dashboard_patient.ejs','views/dashboard_doctor.ejs',
    'views/appointment_status.ejs','views/appointment_detail.ejs',
    'views/appointment_intake.ejs','views/doctor_intake.ejs',
    'public/css/style.css'
  ];
  const missing = mustFiles.filter(f=>!fs.existsSync(path.join(process.cwd(),f)));
  const tables = await all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
  const tnames = tables.map(t=>t.name);
  const needTables = ['users','doctors','appointments','doctor_schedule','doctor_clinics','appointment_intake','files'];
  const tblMissing = needTables.filter(t=>!tnames.includes(t));
  const counts = {};
  for(const t of needTables){
    try{ const c = await get(`SELECT COUNT(*) n FROM ${t}`); counts[t]=c.n; }catch{ counts[t]='(no table)'; }
  }
  console.log('--- FILES ---');
  console.log(missing.length? ('Missing: '+missing.join(', ')) : 'All key files present.');
  console.log('--- TABLES ---');
  console.log('Missing tables:', tblMissing);
  console.log('Row counts:', counts);
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
