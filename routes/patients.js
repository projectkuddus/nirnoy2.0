const express=require('express');
const {all,get}=require('../db');
const router=express.Router();

function needPatient(req,res,next){
  if(!req.session.user) return res.redirect('/login');
  if(req.session.user.role!=='patient') return res.status(403).send('Patient access only');
  next();
}

router.get('/patient/dashboard', needPatient, async (req,res)=>{
  const me = req.session.user;
  const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD

  // Upcoming: later today (queued/called/in_progress) or any future date
  const upcoming = await all(`
    SELECT a.*, du.name AS doctor_name, c.name AS clinic_name
    FROM appointments a
    JOIN doctors d ON d.user_id = a.doctor_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
    WHERE a.patient_id = ?
      AND (
           a.appt_date > ?
        OR (a.appt_date = ? AND a.status IN ('queued','called','in_progress'))
      )
    ORDER BY a.appt_date, a.slot_time
  `,[me.id, today, today]);

  const docSettingsCache=new Map();
  const getDoctorSettings=async(doctorUserId)=>{
    if(docSettingsCache.has(doctorUserId)) return docSettingsCache.get(doctorUserId);
    const meta=await get(`SELECT visit_duration_minutes, running_late_minutes FROM doctors WHERE user_id=?`,[doctorUserId]);
    const data={
      visitDuration:(meta?.visit_duration_minutes??15),
      runningLate:(meta?.running_late_minutes??0)
    };
    docSettingsCache.set(doctorUserId,data);
    return data;
  };
  const groups=new Map();
  for(const appt of upcoming){
    const key=[appt.doctor_id||'0',appt.clinic_id||'0',appt.appt_date||''].join(':');
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(appt);
  }
  const nonQueueStatuses=new Set(['done','completed','cancelled','no_show']);
  for(const list of groups.values()){
    list.sort((a,b)=>String(a.slot_time||'').localeCompare(String(b.slot_time||'')));
    const doctorId=list[0]?.doctor_id;
    if(!doctorId) continue;
    const settings=await getDoctorSettings(doctorId);
    let position=1;
    for(const appt of list){
      const status=(appt.status||'').toLowerCase();
      if(nonQueueStatuses.has(status)) continue;
      appt.position=position;
      appt.etaMinutes=(position-1)*settings.visitDuration+settings.runningLate;
      position++;
    }
  }

  // Past: finished/no_show or any day earlier than today
  const past = await all(`
    SELECT a.*, du.name AS doctor_name, c.name AS clinic_name
    FROM appointments a
    JOIN doctors d ON d.user_id = a.doctor_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
    WHERE a.patient_id = ?
      AND (
           a.appt_date < ?
        OR  a.status IN ('done','no_show')
      )
    ORDER BY a.appt_date DESC, a.slot_time DESC
  `,[me.id, today]);

  res.render('dashboard_patient',{upcoming,past});
});

router.get('/consultations/appointment/:id', needPatient, async (req,res)=>{
  const me = req.session.user;
  const a=await get(`SELECT a.*, du.name AS doctor_name, c.name AS clinic_name
    FROM appointments a JOIN doctors d ON d.id=a.doctor_id
    JOIN users du ON du.id=d.user_id
    LEFT JOIN doctor_clinics c ON c.id=a.clinic_id
    WHERE a.id=? AND a.patient_id=?`,[req.params.id,me.id]);
  if(!a) return res.status(404).send('Not found');
  const c=await get(`SELECT * FROM consultations WHERE appointment_id=?`,[a.id]);
  res.render('consultation_view',{a,cons:c});
});

router.get('/patient/export', needPatient, async (req,res)=>{
  const me = req.session.user;

  const appointments = await all(`
    SELECT
      a.id,
      a.appt_date,
      a.slot_time,
      a.status,
      a.serial_no,
      a.clinic_id,
      a.doctor_id,
      a.for_person_name,
      a.diagnosis,
      a.prescription_text,
      a.advice,
      du.name AS doctor_name,
      du.email AS doctor_email,
      c.name AS clinic_name,
      c.area AS clinic_area
    FROM appointments a
    JOIN doctors d ON d.user_id = a.doctor_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN doctor_clinics c ON c.id = a.clinic_id
    WHERE a.patient_id = ?
    ORDER BY a.appt_date, a.slot_time
  `,[me.id]);

  const exportPayload = {
    patient: {
      id: me.id,
      name: me.name,
      email: me.email
    },
    generated_at: new Date().toISOString(),
    appointments
  };

  const fileName = `nirnoy_patient_${me.id}_${new Date().toISOString().slice(0,10)}.json`;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Content-Disposition',`attachment; filename="${fileName}"`);
  res.send(JSON.stringify(exportPayload,null,2));
});

router.get('/patient/appointments', needPatient, async (req, res) => {
  const me = req.session.user;

  const items = await all(`
    SELECT
      a.*,
      du.name AS doctor_name,
      c.name AS clinic_name
    FROM appointments a
    JOIN doctors d ON d.user_id = a.doctor_id
    JOIN users du ON du.id = d.user_id
    LEFT JOIN doctor_clinics c ON c.id = a.clinic_id
    WHERE a.patient_id = ?
    ORDER BY a.appt_date DESC, a.slot_time DESC
  `, [me.id]);

  res.render('patient_appointments', { items });
});

module.exports=router;
