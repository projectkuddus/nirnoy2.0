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

async function renderBookingForm(res,{doctor,clinics,clinicId,requestedDate,flashMessage,flashType='err',errorMessage=null,rescheduleId=null,initialApptDate=null,initialSlotTime=null,initialClinicId=null}){
  const normalizedId=typeof clinicId==='number'?clinicId:(clinicId?Number(clinicId):null);
  const state=await buildBookingState(doctor, normalizedId, requestedDate);
  const hasSlots=Array.isArray(state.slots) && state.slots.length>0;
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
    slots:state.slots,
    error:errorMessage,
    mode:rescheduleId?'reschedule':'new',
    rescheduleId,
    initialApptDate,
    initialSlotTime,
    initialClinicId,
    hasSlots
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
  const errorKey=req.query.error;
  let errorMessage=null;
  if(errorKey==='past_date'){
    errorMessage='You cannot book a past date. Please choose today or a future date.';
  } else if (errorKey==='past_time'){
    errorMessage='You cannot book a time slot that has already passed today. Please choose a later time.';
  } else if (errorKey==='slot_taken'){
    errorMessage='This time slot has just been taken by another patient. Please choose a different time.';
  } else if (errorKey==='booking_failed'){
    errorMessage='Something went wrong while creating your booking. Please try again or choose another slot.';
  } else if (errorKey==='no_slot'){
    errorMessage='Please select a time slot before confirming your booking.';
  }
  const rescheduleId=req.query.rescheduleId||null;
  const initialApptDate=req.query.appt_date||null;
  const initialSlotTime=req.query.slot_time||null;
  const initialClinicId=req.query.clinicId||req.query.clinic_id||null;
  const noClinicsMsg=!clinics.length?'This doctor has not added any clinics yet. Please check back soon.':null;
  return renderBookingForm(res,{
    doctor,
    clinics,
    clinicId,
    requestedDate,
    errorMessage,
    flashMessage:noClinicsMsg,
    flashType:'warn',
    rescheduleId,
    initialApptDate,
    initialSlotTime,
    initialClinicId
  });
});

router.post('/book', needPatient, async (req,res)=>{
  const patientId=req.session.user.id;
  const doctorIdRaw=req.body.doctor_id||req.body.doctorId;
  const clinicIdRaw=req.body.clinic_id||req.body.clinicId;
  const apptDateRaw=(req.body.appt_date||'').trim();
  const slotTimeRaw=req.body.slot_time||'';
  const rescheduleId=req.body.reschedule_id||req.body.rescheduleId||null;
  const slotTime=(slotTimeRaw||'').trim().slice(0,5);
  if(!doctorIdRaw || !clinicIdRaw || !apptDateRaw || !slotTime){
    const params=new URLSearchParams();
    if(doctorIdRaw) params.set('doctorId', String(doctorIdRaw));
    if(clinicIdRaw) params.set('clinicId', String(clinicIdRaw));
    if(apptDateRaw) params.set('appt_date', apptDateRaw);
    params.set('error','no_slot');
    return res.redirect(`/book?${params.toString()}`);
  }
  const doctorId=parseInt(doctorIdRaw,10);
  const requestedClinicId=parseInt(clinicIdRaw,10);
  const requestedDate=sanitizeDateInput(apptDateRaw);
  const doctor=await doctorBasics(doctorId);
  if(!doctor){
    req.session.flash={type:'err',msg:'Doctor not found. Please pick another doctor.'};
    return res.redirect('/doctors');
  }
  const clinics=await loadDoctorClinics(doctor);
  const today=new Date(); today.setHours(0,0,0,0);
  const selectedDateObj=requestedDate? new Date(requestedDate) : null;
  if(!requestedDate || !selectedDateObj || Number.isNaN(selectedDateObj.getTime()) || selectedDateObj<today){
    return res.redirect(`/book?doctorId=${doctorId}&clinicId=${requestedClinicId||''}&error=past_date`);
  }
  if(selectedDateObj.getTime()===today.getTime()){
    if(!slotTime){
      return res.redirect(`/book?doctorId=${doctorId}&clinicId=${requestedClinicId||''}&error=past_time`);
    }
    const parts=String(slotTime).split(':');
    const slotHour=parseInt(parts[0],10);
    const slotMinute=parseInt(parts[1]||'0',10);
    if(Number.isNaN(slotHour)||Number.isNaN(slotMinute)){
      return res.redirect(`/book?doctorId=${doctorId}&clinicId=${requestedClinicId||''}&error=past_time`);
    }
    const now=new Date();
    const slotDateTime=new Date();
    slotDateTime.setHours(slotHour,slotMinute,0,0);
    const BUFFER_MINUTES=10;
    const nowWithBuffer=new Date(now.getTime()+BUFFER_MINUTES*60*1000);
    if(slotDateTime<=nowWithBuffer){
      return res.redirect(`/book?doctorId=${doctorId}&clinicId=${requestedClinicId||''}&error=past_time`);
    }
  }
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
    if(rescheduleId){
      await run(`UPDATE appointments SET status='cancelled' WHERE id=? AND patient_id=?`,[rescheduleId, req.session.user.id]);
    }
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
    let patient=null;
    let doctorRow=null;
    let clinicRow=null;
    let newAppointment=null;
    let oldAppointment=null;
    try{
      patient={
        id:req.session.user && req.session.user.id,
        name:req.session.user && req.session.user.name,
        email:req.session.user && req.session.user.email
      };
      doctorRow=await get(`SELECT * FROM doctors WHERE user_id=?`,[doctor.uid]);
      clinicRow=clinicResolution.id? await get(`SELECT * FROM doctor_clinics WHERE id=?`,[clinicResolution.id]) : null;
      if(appointmentId){
        newAppointment=await get(`SELECT * FROM appointments WHERE id=?`,[appointmentId]);
      }else{
        newAppointment=await get(`
          SELECT *
          FROM appointments
          WHERE patient_id=?
            AND doctor_id=?
            AND clinic_id=?
            AND appt_date=?
            AND slot_time=?
          ORDER BY id DESC
          LIMIT 1
        `,[req.session.user.id, doctor.uid, clinicResolution.id, dateStr, slot]);
      }
      if(rescheduleId){
        oldAppointment=await get(`SELECT * FROM appointments WHERE id=?`,[rescheduleId]);
      }
      if(rescheduleId){
        if(notify?.patientBookingRescheduled){
          notify.patientBookingRescheduled({
            patient,
            doctor: doctorRow,
            clinic: clinicRow,
            oldAppointment,
            newAppointment
          });
        }
        if(notify?.doctorBookingRescheduled){
          notify.doctorBookingRescheduled({
            patient,
            doctor: doctorRow,
            clinic: clinicRow,
            oldAppointment,
            newAppointment
          });
        }
      }else{
        if(notify?.patientBookingCreated){
          notify.patientBookingCreated({
            patient,
            doctor: doctorRow,
            clinic: clinicRow,
            appointment: newAppointment
          });
        }
        if(notify?.doctorBookingCreated){
          notify.doctorBookingCreated({
            patient,
            doctor: doctorRow,
            clinic: clinicRow,
            appointment: newAppointment
          });
        }
      }
    }catch(notifyErr){
      console.error('Error during booking notifications stub',notifyErr);
    }

    return res.redirect(
      '/patient/dashboard?success=' +
      encodeURIComponent(
        rescheduleId
          ? 'Your appointment has been rescheduled.'
          : 'Your appointment has been booked.'
      )
    );
  }catch(err){
    await safeRollback();
    if(err instanceof BookingError){
      return renderBookingForm(res,{
        doctor,
        clinics,
        clinicId:clinicResolution.id,
        requestedDate,
        flashMessage:err.message
      });
    }
    console.error('Error creating appointment', err);
    const msg = (err && err.message) ? err.message : '';
    if(msg.toLowerCase().includes('unique')){
      return res.redirect('/patient/dashboard?error=' + encodeURIComponent('That time slot is no longer available. Please choose another time.'));
    }
    return res.status(500).render('500',{
      user:req.session.user,
      message:'We could not create this booking.'
    });
  }
});

module.exports=router;
