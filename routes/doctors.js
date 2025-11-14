const express=require('express');
const { all, get } = require('../db');
const router=express.Router();

// Public: list doctors with filters
router.get('/doctors', async (req,res,next)=>{
  const q=(req.query.q||'').trim();
  const specialty=(req.query.specialty||'').trim();
  const area=(req.query.area||'').trim();
  const hospital=(req.query.hospital||'').trim();
  const sort=(req.query.sort||'').trim();

  const whereParts=[`u.status='approved'`];
  const params=[];

  if(q){
    const like=`%${q}%`;
    whereParts.push(`(u.name LIKE ? OR d.specialty LIKE ? OR c.name LIKE ? OR c.area LIKE ?)`);
    params.push(like,like,like,like);
  }
  if(specialty){
    whereParts.push(`d.specialty = ?`);
    params.push(specialty);
  }
  if(area){
    whereParts.push(`(d.area = ? OR c.area = ?)`);
    params.push(area,area);
  }
  if(hospital){
    whereParts.push(`c.name = ?`);
    params.push(hospital);
  }

  let orderBy='u.name ASC';
  if(sort==='fee_asc'){
    orderBy='d.fee ASC, u.name ASC';
  }else if(sort==='fee_desc'){
    orderBy='d.fee DESC, u.name ASC';
  }

  let sql=`
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
  `;

  if(whereParts.length){
    sql+=` WHERE ${whereParts.join(' AND ')}`;
  }
  sql+=` GROUP BY d.id ORDER BY ${orderBy}`;

  try{
    const nirnoyDoctors=await all(sql,params);

    const directoryWhere=[];
    const directoryParams=[];
    if(q){
      const like=`%${q}%`;
      directoryWhere.push(`(full_name LIKE ? OR specialty LIKE ? OR hospital_name LIKE ? OR area LIKE ?)`);
      directoryParams.push(like,like,like,like);
    }
    if(specialty){
      directoryWhere.push(`specialty = ?`);
      directoryParams.push(specialty);
    }
    if(area){
      directoryWhere.push(`area = ?`);
      directoryParams.push(area);
    }
    if(hospital){
      directoryWhere.push(`hospital_name = ?`);
      directoryParams.push(hospital);
    }
    let directorySql=`
      SELECT
        id,
        full_name,
        specialty,
        hospital_name,
        area,
        phone
      FROM doctor_directory
    `;
    if(directoryWhere.length){
      directorySql+=` WHERE ${directoryWhere.join(' AND ')}`;
    }
    directorySql+=` ORDER BY full_name ASC`;
    const directoryDoctors=await all(directorySql,directoryParams);
    const nirnoyMapped=nirnoyDoctors.map(d=>({
      ...d,
      source:'nirnoy',
      canBook:true
    }));
    const directoryMapped=directoryDoctors.map(d=>({
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
      source:'directory',
      canBook:false
    }));
    const allDoctors=[...nirnoyMapped,...directoryMapped];

    const [
      specialtyRows,
      areaRows,
      hospitalRows,
      dirSpecialtyRows,
      dirAreaRows,
      dirHospitalRows
    ]=await Promise.all([
      all(`
        SELECT DISTINCT TRIM(specialty) AS specialty
        FROM doctors
        WHERE specialty IS NOT NULL AND TRIM(specialty) <> ''
        ORDER BY specialty ASC
      `),
      all(`
        SELECT val AS area FROM (
          SELECT DISTINCT TRIM(area) AS val FROM doctors WHERE area IS NOT NULL AND TRIM(area) <> ''
          UNION
          SELECT DISTINCT TRIM(area) AS val FROM doctor_clinics WHERE area IS NOT NULL AND TRIM(area) <> ''
        )
        WHERE val <> ''
        ORDER BY val ASC
      `),
      all(`
        SELECT DISTINCT TRIM(name) AS hospital
        FROM doctor_clinics
        WHERE name IS NOT NULL AND TRIM(name) <> ''
        ORDER BY hospital ASC
      `),
      all(`
        SELECT DISTINCT TRIM(specialty) AS specialty
        FROM doctor_directory
        WHERE specialty IS NOT NULL AND TRIM(specialty) <> ''
      `),
      all(`
        SELECT DISTINCT TRIM(area) AS area
        FROM doctor_directory
        WHERE area IS NOT NULL AND TRIM(area) <> ''
      `),
      all(`
        SELECT DISTINCT TRIM(hospital_name) AS hospital
        FROM doctor_directory
        WHERE hospital_name IS NOT NULL AND TRIM(hospital_name) <> ''
      `)
    ]);

    const uniqSorted=(values=[])=>{
      const filtered=values.filter(Boolean);
      const uniq=[...new Set(filtered)];
      return uniq.sort((a,b)=>a.localeCompare(b));
    };

    const specialties=uniqSorted([
      ...specialtyRows.map(r=>r.specialty),
      ...dirSpecialtyRows.map(r=>r.specialty)
    ]);
    const areas=uniqSorted([
      ...areaRows.map(r=>r.area),
      ...dirAreaRows.map(r=>r.area)
    ]);
    const hospitals=uniqSorted([
      ...hospitalRows.map(r=>r.hospital),
      ...dirHospitalRows.map(r=>r.hospital)
    ]);

    res.render('doctors_list',{
      doctors:allDoctors,
      rows:allDoctors,
      filters:{specialties,areas,hospitals},
      selected:{q:q||'',specialty:specialty||'',area:area||'',hospital:hospital||'',sort:sort||''},
      q:q||'',
      specialty:specialty||'',
      area:area||'',
      hospital:hospital||'',
      sort:sort||''
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
        area,
        phone
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
