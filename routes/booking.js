const express=require('express'); const {all,get,run}=require('../db');
const notify = require('../notify');
const router=express.Router();

function needPatient(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='patient' && req.session.user.role!=='admin') return res.status(403).send('Patient only');
  next();
}
const toMin=s=>{ const [h,m]=String(s).split(':').map(n=>parseInt(n,10)||0); return h*60+m; };
const mm=x=>String(x).padStart(2,'0');
const fromMin=m=>`${mm(Math.floor(m/60))}:${mm(m%60)}`;
const MAX_BOOK_AHEAD_DAYS=14;

class BookingError extends Error{
  constructor(message,code='BOOKING_ERROR'){
    super(message);
    this.code=code;
  }
}

const sanitizeDateInput=str=>{
  const val=(str||'').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(val)?val:'';
};
const isoToday=()=>{
  const d=new Date();
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
};

async function doctorBasics(doctorUserId){
  return await get(`
    SELECT
      d.id AS did,
      d.visit_duration_minutes,
      COALESCE(d.fee,'') AS fee,
      COALESCE(d.specialty,'') AS specialty,
      COALESCE(d.area,'') AS area,
      d.photo_url,
      u.id AS uid,
      u.name,
      u.email
    FROM doctors d
    JOIN users u ON u.id=d.user_id
    WHERE u.id=? AND u.status='approved' AND u.role='doctor'`,[doctorUserId]);
}

async function loadDoctorClinics(doctor){
  if(!doctor) return [];
  return await all(`
    SELECT
      id,
      name,
      address,
      area,
      area AS city,
      '' AS phone
    FROM doctor_clinics
    WHERE doctor_id=?
    ORDER BY name ASC
  `,[doctor.did]);
}

function resolveClinicId(clinics, rawId,{strict=false}={}){
  if(!clinics.length) return {id:null,isValid:false};
  const numeric=Number(rawId);
  const match=!Number.isNaN(numeric)?clinics.find(c=>Number(c.id)===numeric):null;
  if(match) return {id:Number(match.id),isValid:true};
  if(strict) return {id:null,isValid:false};
  return {id:Number(clinics[0].id),isValid:false};
}

async function buildBookingState(doctor, clinicId, requestedDate){
  const todayStr=isoToday();
  const desired=sanitizeDateInput(requestedDate);
  let selectedDate=desired||todayStr;
  const state={days:[],slots:[],selectedDate};
  if(!clinicId){
    state.selectedDate=selectedDate;
    return state;
  }

  const schedule=await all(`SELECT day_of_week,start_time,end_time FROM doctor_schedule WHERE doctor_id=? AND clinic_id=? ORDER BY day_of_week`,
    [doctor.uid, clinicId]);
  if(!schedule.length){
    state.selectedDate=selectedDate;
    return state;
  }

  const allowedDays=new Set(schedule.map(r=>Number(r.day_of_week)));
  const today=new Date(); today.setHours(0,0,0,0);
  const days=[];
  for(let i=0;i<MAX_BOOK_AHEAD_DAYS;i++){
    const d=new Date(today.getTime()+i*86400000);
    if(allowedDays.has(d.getDay())){
      days.push(d.toISOString().slice(0,10));
    }
  }
  state.days=days;
  if(days.length){
    if(desired && days.includes(desired)){
      selectedDate=desired;
    }else if(days.includes(todayStr)){
      selectedDate=todayStr;
    }else{
      selectedDate=days[0];
    }
  }
  state.selectedDate=selectedDate;

  if(!days.length || !selectedDate){
    return state;
  }

  const targetDate=new Date(`${selectedDate}T00:00:00`);
  if(Number.isNaN(targetDate.getTime())){
    return state;
  }
  const dow=targetDate.getDay();
  const ranges=schedule.filter(r=>Number(r.day_of_week)===dow);
  if(!ranges.length){
    return state;
  }

  const takenRows=await all(`SELECT slot_time FROM appointments WHERE doctor_id=? AND clinic_id=? AND appt_date=?`,
    [doctor.uid, clinicId, selectedDate]);
  const taken=new Set(takenRows.map(r=>r.slot_time));
  const step=doctor.visit_duration_minutes||15;
  const slots=[];
  for(const r of ranges){
    let t=toMin(r.start_time), end=toMin(r.end_time);
    while(t+step<=end){
      const hhmm=fromMin(t);
      if(!taken.has(hhmm)) slots.push(hhmm);
      t+=step;
    }
  }
  state.slots=slots;
  return state;
}

async function renderBookingForm(res,{doctor,clinics,clinicId,requestedDate,flashMessage,flashType='err'}){
  const normalizedId=typeof clinicId==='number'?clinicId:(clinicId?Number(clinicId):null);
  const state=await buildBookingState(doctor, normalizedId, requestedDate);
  if(flashMessage){
    res.locals.flash={type:flashType,msg:flashMessage};
  }
  return res.render('booking_form',{
    doctor,
    doc:doctor,
    clinics,
    clinicId:normalizedId,
    selectedClinicId:normalizedId,
    date:state.selectedDate,
    selectedDate:state.selectedDate,
    days:state.days,
    slots:state.slots
  });
}

async function ensureSlotAvailable(doctor, clinicId, apptDate, slotTime){
  if(!clinicId) throw new BookingError('Please select a clinic before booking.');
  const dateStr=sanitizeDateInput(apptDate);
  if(!dateStr) throw new BookingError('Please choose a valid appointment date.');
  const slot=(slotTime||'').trim().slice(0,5);
  if(!/^\d{2}:\d{2}$/.test(slot)) throw new BookingError('Please choose a valid time slot.');

  const schedule=await all(`SELECT day_of_week,start_time,end_time FROM doctor_schedule WHERE doctor_id=? AND clinic_id=? ORDER BY day_of_week`,
    [doctor.uid, clinicId]);
  if(!schedule.length) throw new BookingError('This clinic has no published schedule yet. Please pick another clinic.');

  const dateObj=new Date(`${dateStr}T00:00:00`);
  if(Number.isNaN(dateObj.getTime())) throw new BookingError('Please choose a valid appointment date.');
  const today=new Date(); today.setHours(0,0,0,0);
  if(dateObj<today) throw new BookingError('Please pick a future date.');
  const dow=dateObj.getDay();
  const ranges=schedule.filter(r=>Number(r.day_of_week)===dow);
  if(!ranges.length) throw new BookingError('The doctor is not available on that day.');

  const step=doctor.visit_duration_minutes||15;
  const allowed=new Set();
  for(const r of ranges){
    let start=toMin(r.start_time), end=toMin(r.end_time);
    while(start+step<=end){
      allowed.add(fromMin(start));
      start+=step;
    }
  }
  if(!allowed.has(slot)) throw new BookingError('Please pick a time within the doctor schedule.');

  const clash=await get(`SELECT id FROM appointments WHERE doctor_id=? AND clinic_id=? AND appt_date=? AND slot_time=?`,
    [doctor.uid, clinicId, dateStr, slot]);
  if(clash) throw new BookingError('That slot was just booked. Please choose another time.','SLOT_TAKEN');
  return {dateStr,slot};
}

router.get('/book', needPatient, async (req,res)=>{
  const doctorId=parseInt(req.query.doctorId||req.query.doctor_id||'',10);
  if(!doctorId){
    req.session.flash={type:'err',msg:'Please select a doctor before booking.'};
    return res.redirect('/doctors');
  }
  const doctor=await doctorBasics(doctorId);
  if(!doctor){
    req.session.flash={type:'err',msg:'Doctor not found. Please pick another doctor.'};
    return res.redirect('/doctors');
  }
  const clinics=await loadDoctorClinics(doctor);
  const requestedClinicId=parseInt(req.query.clinicId||req.query.clinic_id||'',10);
  const {id:clinicId}=resolveClinicId(clinics, requestedClinicId,{strict:false});
  const requestedDate=sanitizeDateInput(req.query.date);
  const noClinicsMsg=!clinics.length?'This doctor has not added any clinics yet. Please check back soon.':null;
  return renderBookingForm(res,{
    doctor,
    clinics,
    clinicId,
    requestedDate,
    flashMessage:noClinicsMsg,
    flashType:'warn'
  });
});

router.post('/book', needPatient, async (req,res)=>{
  const doctorId=parseInt(req.body.doctorId||req.body.doctor_id||'',10);
  if(!doctorId){
    req.session.flash={type:'err',msg:'Please select a doctor before booking.'};
    return res.redirect('/doctors');
  }
  const doctor=await doctorBasics(doctorId);
  if(!doctor){
    req.session.flash={type:'err',msg:'Doctor not found. Please pick another doctor.'};
    return res.redirect('/doctors');
  }
  const clinics=await loadDoctorClinics(doctor);
  const requestedClinicId=parseInt(req.body.clinicId||req.body.clinic_id||'',10);
  const requestedDate=sanitizeDateInput(req.body.appt_date);
  const slotTime=(req.body.slot_time||'').trim().slice(0,5);
  const clinicResolution=resolveClinicId(clinics, requestedClinicId,{strict:true});
  if(!clinicResolution.id){
    return renderBookingForm(res,{doctor,clinics,clinicId:null,requestedDate,flashMessage:'Please select a clinic before booking.'});
  }
  if(!requestedDate){
    return renderBookingForm(res,{doctor,clinics,clinicId:clinicResolution.id,requestedDate,flashMessage:'Please choose a valid date.'});
  }
  if(!/^\d{2}:\d{2}$/.test(slotTime)){
    return renderBookingForm(res,{doctor,clinics,clinicId:clinicResolution.id,requestedDate,flashMessage:'Please choose a time slot.'});
  }

  await run('BEGIN IMMEDIATE');
  let txActive=true;
  const safeRollback=async()=>{ if(txActive){ try{ await run('ROLLBACK'); }catch(_){ } txActive=false; } };

  try{
    const {dateStr,slot}=await ensureSlotAvailable(doctor, clinicResolution.id, requestedDate, slotTime);
    const insert=await run(`INSERT INTO appointments(patient_id,doctor_id,clinic_id,appt_date,slot_time,status)
                            VALUES(?,?,?,?,?,?)`,
      [req.session.user.id, doctor.uid, clinicResolution.id, dateStr, slot, 'queued']);
    const appointmentId = insert.lastID;
    await run('COMMIT'); txActive=false;
    try {
      notify.notifyAppointmentBooked({
        appointmentId,
        doctorId: doctor.uid,
        patientId: req.session.user.id,
        appt_date: dateStr,
        slot_time: slot
      });
    } catch (err) {
      console.error('notifyAppointmentBooked failed (dev stub):', err);
    }
    req.session.flash={type:'ok',msg:'Your appointment is booked.'};
    return res.redirect('/patient/dashboard');
  }catch(err){
    await safeRollback();
    const friendly=err instanceof BookingError?err.message:'Something went wrong while booking. Please try another slot.';
    return renderBookingForm(res,{
      doctor,
      clinics,
      clinicId:clinicResolution.id,
      requestedDate,
      flashMessage:friendly
    });
  }
});

module.exports=router;
