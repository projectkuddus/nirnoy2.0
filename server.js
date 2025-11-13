const express=require('express'),path=require('path'),fs=require('fs'),crypto=require('crypto');
const session=require('express-session'),methodOverride=require('method-override');
require('./db');
const app=express();
const {all:dbAll,run:dbRun}=require('./db');
const isProduction=process.env.NODE_ENV==='production';
const blockInProduction=(req,res,next)=>{if(isProduction)return res.status(404).send('Not found');return next();};
const isDevPath=path=>path.startsWith('/dev')||path.startsWith('/migrate')||path.startsWith('/debug');
// Ensure unique constraint for appointments (doctor, clinic, appt_date, slot)
(async function ensureAppointmentsUniqueIndex(){
  try{
    await dbRun(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_appt_unique
      ON appointments(doctor_id, clinic_id, appt_date, slot_time)
    `);
    console.log('[migrate] appointments unique index ensured');
  }catch(e){
    console.error('[migrate] unique index failed',e);
  }
})();
// --- ONE-TIME AUTO-MIGRATION: add doctor meta columns if missing ---
(async function ensureDoctorMetaColumns(){
  try{
    const cols=await dbAll('PRAGMA table_info(doctors)');
    const names=cols.map(c=>c.name);
    if(!names.includes('specialty'))await dbRun('ALTER TABLE doctors ADD COLUMN specialty TEXT');
    if(!names.includes('area'))await dbRun('ALTER TABLE doctors ADD COLUMN area TEXT');
    if(!names.includes('fee'))await dbRun('ALTER TABLE doctors ADD COLUMN fee TEXT');
    console.log('[migrate] doctors.specialty/area/fee ensured');
  }catch(e){
    console.error('[migrate] ensureDoctorMetaColumns failed',e);
  }
})();
const UP=path.join(__dirname,'uploads');try{fs.mkdirSync(UP,{recursive:true});}catch(_){}
app.set('view engine','ejs');app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true}));app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname,'public')));app.use('/uploads',express.static(path.join(__dirname,'uploads')));
app.use(session({
  secret:process.env.SESSION_SECRET||'dev-secret-only',
  resave:false,
  saveUninitialized:false,
  cookie:{
    httpOnly:true,
    sameSite:isProduction?'strict':'lax',
    secure:isProduction
  }
}));
app.use((req,res,next)=>{
  if(!req.session.csrfToken){
    req.session.csrfToken=crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken=req.session.csrfToken;
  next();
});
app.use((req,res,next)=>{
  const path=req.path||'';
  if(req.method==='GET'||req.method==='HEAD'||req.method==='OPTIONS') return next();
  if(isDevPath(path)) return next();
  if(req.is && req.is('multipart/form-data')) return next();
  const token=req.body ? req.body._csrf : null;
  if(!token || !req.session || token!==req.session.csrfToken){
    return res.status(403).send('Invalid CSRF token');
  }
  next();
});
app.use((req,res,next)=>{res.locals.user=req.session.user||null;res.locals.flash=req.session.flash||null;delete req.session.flash;next();});
app.use(require('./routes/auth'));
app.use(require('./routes/admin_manage'));
app.use(blockInProduction,require('./routes/migrate'));
app.use(blockInProduction,require('./routes/migrate_step4'));
app.use(blockInProduction,require('./routes/dev_tools'));
app.use(blockInProduction,require('./routes/migrate_step5'));
app.use(blockInProduction,require('./routes/migrate_step6'));
app.use(blockInProduction,require('./routes/migrate_step8'));
app.use(blockInProduction,require('./routes/migrate_step9'));
app.use(blockInProduction,require('./routes/migrate_step15'));
app.use(blockInProduction,require('./routes/migrate_fix_doctors_meta'));
app.use(require('./routes/files'));
app.use(require('./routes/doctor'));
app.use(require('./routes/doctors'));
app.use(require('./routes/appointments'));
app.use(require('./routes/doctor_portal'));
app.use(require('./routes/booking'));
app.use(require('./routes/clinics'));
app.use(require('./routes/patients'));
app.use(require('./routes/doctor_photo'));
app.use(blockInProduction,require('./routes/migrate_step13'));
app.get('/',(req,res)=>{
  const user=req.session?.user;
  if(user){
    if(user.role==='patient') return res.redirect('/patient/dashboard');
    if(user.role==='doctor') return res.redirect('/doctor/dashboard');
    if(user.role==='admin') return res.redirect('/admin/doctors');
  }
  res.render('home',{title:'Nirnoy — AI triage & clinic queue'});
});
app.get('/debug/me',blockInProduction,(req,res)=>{res.type('json').send(JSON.stringify(req.session.user||{},null,2));});
app.get('/debug/outbox',blockInProduction,(req,res)=>{const p=path.join(__dirname,'outbox.log');if(!fs.existsSync(p))return res.type('text').send('(empty)');res.type('text').send(fs.readFileSync(p,'utf8'));});
require('./jobs');

app.listen(3000,()=>console.log('Nirnoy 2.0 running at http://localhost:3000'));
