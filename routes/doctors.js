const express=require('express');
const { all, get } = require('../db');
const router=express.Router();

// Public: list doctors with filters
router.get('/doctors', async (req,res)=>{
  const q=(req.query.q||'').trim();
  const specialty=(req.query.specialty||'').trim();
  const area=(req.query.area||'').trim();
  const maxFee=(req.query.maxFee||'').trim();

  let sql = `
    SELECT d.id AS did, u.id AS uid, u.name, u.email,
           COALESCE(d.specialty,'') AS specialty,
           COALESCE(d.area,'') AS area,
           COALESCE(d.fee,'') AS fee
    FROM doctors d
    JOIN users u ON u.id=d.user_id
    WHERE u.status='approved'
  `;
  const params=[];

  if(q){
    sql+=` AND (u.name LIKE ? OR d.specialty LIKE ? OR d.area LIKE ?)`;
    params.push(`%${q}%`,`%${q}%`,`%${q}%`);
  }
  if(specialty){
    sql+=` AND d.specialty LIKE ?`; params.push(`%${specialty}%`);
  }
  if(area){
    sql+=` AND d.area LIKE ?`; params.push(`%${area}%`);
  }
  if(maxFee && /^\d+$/.test(maxFee)){
    sql+=` AND d.fee IS NOT NULL AND d.fee <= ?`; params.push(Number(maxFee));
  }

  sql+=` ORDER BY u.name ASC`;

  const rows = await all(sql, params);
  res.render('doctors_list',{rows, q, specialty, area, maxFee});
});

// Public: doctor detail page (kept simple)
router.get('/doctors/:id', async (req,res)=>{
  const d = await get(`
    SELECT d.id AS did, u.id AS uid, u.name, u.email,
           d.bmdc_no, COALESCE(d.specialty,'') AS specialty,
           COALESCE(d.area,'') AS area, COALESCE(d.fee,'') AS fee
    FROM doctors d JOIN users u ON u.id=d.user_id
    WHERE d.id=? AND u.status='approved'
  `,[req.params.id]);
  if(!d) return res.status(404).send('Doctor not found');
  res.render('doctor_detail',{d});
});

module.exports=router;
