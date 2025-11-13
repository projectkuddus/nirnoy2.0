const cron = require('node-cron');
const { all, get, run } = require('./db');
const { sendEmail, sendSMS } = require('./notify');

function minutesUntil(dateStr, timeStr){
  const [h,m]=(timeStr||'00:00').split(':').map(Number);
  const t=new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  return Math.floor((t-new Date())/60000);
}

// Every minute: remind upcoming bookings (≤60 min, not yet reminded)
cron.schedule('* * * * *', async ()=>{
  try{
    let appts=[];
    try{
      appts = await all(`SELECT a.*, pu.email AS patient_email
        FROM appointments a JOIN users pu ON pu.id=a.patient_id
        WHERE a.status IN ('queued','called')
          AND IFNULL(a.reminder_sent,0)=0
          AND IFNULL(a.appt_date,'')!=''`);
    }catch(err){
      if(String(err.message||err).includes('appt_date')){
        console.warn('[jobs] appt_date column missing; skipping reminder run');
        return;
      }
      throw err;
    }
    for(const a of appts){
      const apptDate=a.appt_date||a.date;
      if(!apptDate) continue;
      const mins = minutesUntil(apptDate, a.slot_time);
      if(mins<=60 && mins>=0){
        const msg=`Reminder: ${apptDate} ${a.slot_time} | Serial ${a.serial_no}`;
        await sendEmail(a.patient_email,'Nirnoy appointment reminder',msg);
        await sendSMS(null,msg);
        await run(`UPDATE appointments SET reminder_sent=1 WHERE id=?`,[a.id]);
      }
    }
  }catch(err){
    console.warn('[jobs] reminder tick failed',err);
  }
});

console.log('[jobs] scheduler started');
