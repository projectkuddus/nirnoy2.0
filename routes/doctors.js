const express=require('express');
const { all, get } = require('../db');
const router=express.Router();

// Public: list doctors with filters
router.get('/doctors', async (req,res,next)=>{
  try{
    const q=(req.query.q||'').trim();
    const specialty=(req.query.specialty||'').trim();
    const area=(req.query.area||'').trim();
    const hospital=(req.query.hospital||'').trim();
    const sort=(req.query.sort||'').trim();

    // 1) Approved Nirnoy doctors
    const nirnoyRaw=await all(`
      SELECT
        d.id AS did,
        u.id AS uid,
        u.name,
        u.email,
        COALESCE(d.specialty,'') AS specialty,
        COALESCE(d.area,'') AS area,
        d.fee,
        d.photo_url,
        COALESCE(c.name,'') AS clinic_name,
        COALESCE(c.area,'') AS clinic_city
      FROM doctors d
      JOIN users u ON u.id=d.user_id
      LEFT JOIN doctor_clinics c ON c.doctor_id=d.id
      WHERE u.status='approved'
    `,[]);

    const nirnoyDoctors=nirnoyRaw.map(d=>({
      id:d.did,
      did:d.did,
      uid:d.uid,
      name:d.name,
      email:d.email,
      specialty:d.specialty||'',
      area:d.area||'',
      fee:d.fee,
      photo_url:d.photo_url,
      clinic_name:d.clinic_name||'',
      clinic_city:d.clinic_city||'',
      source:'nirnoy'
    }));

    // 2) CSV-imported public directory doctors
    const directoryRaw=await all(`
      SELECT
        id,
        full_name,
        specialty,
        hospital_name,
        area,
        phone
      FROM doctor_directory
    `,[]);

    const directoryDoctors=directoryRaw.map(d=>({
      id:d.id,
      did:null,
      uid:null,
      name:d.full_name,
      email:null,
      specialty:d.specialty||'',
      area:d.area||'',
      fee:null,
      photo_url:null,
      clinic_name:d.hospital_name||'',
      clinic_city:d.area||'',
      source:'directory'
    }));

    // Combine
    const allDoctors=[...nirnoyDoctors,...directoryDoctors];

    // Filter option sets
    const uniqSorted=(arr=[])=>{
      return [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    };

    const specialties=uniqSorted(allDoctors.map(d=>d.specialty));
    const areas=uniqSorted(allDoctors.map(d=>d.area || d.clinic_city));
    const hospitals=uniqSorted(allDoctors.map(d=>d.clinic_name));

    // Apply filters in memory
    let filtered=allDoctors.slice();
    if(q){
      const qLower=q.toLowerCase();
      filtered=filtered.filter(d=>{
        const name=(d.name||'').toLowerCase();
        const spec=(d.specialty||'').toLowerCase();
        const hosp=(d.clinic_name||'').toLowerCase();
        const ar=(d.area||d.clinic_city||'').toLowerCase();
        return (
          name.includes(qLower) ||
          spec.includes(qLower) ||
          hosp.includes(qLower) ||
          ar.includes(qLower)
        );
      });
    }

    if(specialty){
      filtered=filtered.filter(d=>(d.specialty||'')===specialty);
    }
    if(area){
      filtered=filtered.filter(d=>(d.area||d.clinic_city||'')===area);
    }
    if(hospital){
      filtered=filtered.filter(d=>(d.clinic_name||'')===hospital);
    }

    // Sort
    if(sort==='fee_asc'){
      filtered=filtered.slice().sort((a,b)=>{
        const fa=a.fee || Number.MAX_SAFE_INTEGER;
        const fb=b.fee || Number.MAX_SAFE_INTEGER;
        return fa-fb;
      });
    }else if(sort==='fee_desc'){
      filtered=filtered.slice().sort((a,b)=>{
        const fa=a.fee || 0;
        const fb=b.fee || 0;
        return fb-fa;
      });
    }else{
      filtered=filtered.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    }

    res.render('doctors_list',{
      doctors:filtered,
      filters:{specialties,areas,hospitals},
      selected:{
        q,
        specialty,
        area,
        hospital,
        sort
      }
    });
  }catch(err){
    next(err);
  }
});

// Public: doctor detail page
router.get('/doctors/:id', async (req,res,next)=>{
  const doctorId=req.params.id;
  try{
    const doctor=await get(`
      SELECT
        d.id AS did,
        u.id AS uid,
        u.name,
        u.email,
        COALESCE(d.specialty,'') AS specialty,
        COALESCE(d.area,'') AS area,
        d.fee,
        d.photo_url,
        u.status
      FROM doctors d
      JOIN users u ON u.id=d.user_id
      WHERE d.id=?
    `,[doctorId]);
    if(!doctor)return res.status(404).render('error',{message:'Doctor not found'});

    const clinics=await all(`
      SELECT
        id,
        name,
        address,
        area
      FROM doctor_clinics
      WHERE doctor_id=?
      ORDER BY name ASC
    `,[doctorId]);

    const statsRow=await get(`
      SELECT COUNT(*) AS total_completed
      FROM appointments
      WHERE doctor_id=? AND status='completed'
    `,[doctorId]);
    const stats={totalCompleted:statsRow?statsRow.total_completed:0};

    res.render('doctor_profile',{doctor,clinics,stats});
  }catch(err){
    next(err);
  }
});

module.exports=router;
