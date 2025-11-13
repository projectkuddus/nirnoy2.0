const express=require('express'); const {all,get,run}=require('../db');
const router=express.Router();

function needPatient(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='patient' && req.session.user.role!=='admin') return res.status(403).send('Patient only');
  next();
}
const toMin=s=>{ const [h,m]=String(s).split(':').map(n=>parseInt(n,10)||0); return h*60+m; };
const mm=x=>String(x).padStart(2,'0');
const fromMin=m=>`${mm(Math.floor(m/60))}:${mm(m%60)}`;

async function doctorBasics(doctorUserId){
  return await get(`
    SELECT u.id as uid, u.name, d.visit_duration_minutes, COALESCE(d.fee,'') fee
    FROM users u JOIN doctors d ON d.user_id=u.id
    WHERE u.id=? AND u.status='approved' AND u.role='doctor'`,[doctorUserId]);
}

router.get('/book', needPatient, async (req,res)=>{
  const doctorId=parseInt(req.query.doctorId||'0',10);
  if(!doctorId) return res.redirect('/doctors');

  const doc=await doctorBasics(doctorId); if(!doc) return res.status(404).send('Doctor not found');

  const clinics=await all(`SELECT * FROM doctor_clinics WHERE doctor_id=? ORDER BY id`,[doctorId]);
  if(!clinics.length) return res.status(400).send('Doctor has no clinics');
  const clinicId=parseInt(req.query.clinicId||clinics[0].id,10);

  const sched=await all(`SELECT day_of_week,start_time,end_time FROM doctor_schedule WHERE doctor_id=? AND clinic_id=? ORDER BY day_of_week`,[doctorId, clinicId]);
  const allowedDays=new Set(sched.map(r=>r.day_of_week));

  const today=new Date(); today.setHours(0,0,0,0);
  const days=[];
  for(let i=0;i<14;i++){
    const d=new Date(today.getTime()+i*86400000);
    const dow=d.getDay();
    if(allowedDays.has(dow)){
      days.push(d.toISOString().slice(0,10));
    }
  }
  if(!days.length){ return res.render('notice',{title:'No schedule',message:'No available days for this clinic.'}); }

  const date=(req.query.date && days.includes(req.query.date))? req.query.date : days[0];

  const dow=new Date(date).getDay();
  const ranges=sched.filter(r=>r.day_of_week===dow);
  const takenRows=await all(`SELECT slot_time FROM appointments WHERE doctor_id=? AND clinic_id=? AND appt_date=?`,[doctorId, clinicId, date]);
  const taken=new Set(takenRows.map(r=>r.slot_time));
  const step=doc.visit_duration_minutes||15;

  const slots=[];
  for(const r of ranges){
    let t=toMin(r.start_time), end=toMin(r.end_time);
    while(t+step<=end){
      const hhmm=fromMin(t);
      if(!taken.has(hhmm)) slots.push(hhmm);
      t+=step;
    }
  }

  res.render('booking_form',{doc,clinics,clinicId,date,days,slots});
});

router.post('/book', needPatient, async (req,res)=>{
  const doctorId=parseInt(req.body.doctorId,10);
  const clinicId=parseInt(req.body.clinicId,10);
  const date=(req.body.appt_date||'').slice(0,10);
  const slot=(req.body.slot_time||'').slice(0,5);
  if(!doctorId||!clinicId||!date||!slot) return res.status(400).send('Missing data');

  const clash=await get(`SELECT id FROM appointments WHERE doctor_id=? AND clinic_id=? AND appt_date=? AND slot_time=?`,[doctorId,clinicId,date,slot]);
  if(clash){
    return res.render('notice',{title:'Slot taken',message:'Please pick another slot.',
      actions:[{label:'Back to booking',href:`/book?doctorId=${doctorId}&clinicId=${clinicId}&date=${date}`}]});
  }

  const r=await run(`INSERT INTO appointments(patient_id,doctor_id,clinic_id,appt_date,slot_time,status)
                     VALUES(?,?,?,?,?,?)`,
                     [req.session.user.id, doctorId, clinicId, date, slot, 'queued']);
  const id=r.lastID;
  res.redirect(`/appointments/${id}/status`);
});

module.exports=router;
