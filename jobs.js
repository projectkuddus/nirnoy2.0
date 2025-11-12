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
    const appts = await all(`SELECT a.*, pu.email AS patient_email
      FROM appointments a JOIN users pu ON pu.id=a.patient_id
      WHERE a.status='booked' AND IFNULL(a.reminder_sent,0)=0`);
    for(const a of appts){
      const mins = minutesUntil(a.date, a.slot_time);
      if(mins<=60 && mins>=0){
        const msg=`Reminder: ${a.date} ${a.slot_time} | Serial ${a.serial_no}`;
        await sendEmail(a.patient_email,'Nirnoy appointment reminder',msg);
        await sendSMS(null,msg);
        await run(`UPDATE appointments SET reminder_sent=1 WHERE id=?`,[a.id]);
      }
    }
  }catch(_){/* silent for MVP */}
});

console.log('[jobs] scheduler started');
