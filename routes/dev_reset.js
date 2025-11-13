const express=require('express'); const {get,run}=require('../db'); const bcrypt=require('bcryptjs');
const router=express.Router();
// DEV ONLY. Remove after use.
// GET /dev/reset?t=letmein2025&email=someone@example.com&pw=newpass
router.get('/dev/reset', async (req,res)=>{
  if(req.query.t!=='letmein2025') return res.status(403).send('bad token');
  const {email,pw}=req.query; if(!email||!pw) return res.status(400).send('email & pw required');
  const u=await get(`SELECT * FROM users WHERE email=?`,[email]);
  const hash=await bcrypt.hash(pw,10);
  if(u) await run(`UPDATE users SET password_hash=? WHERE id=?`,[hash,u.id]);
  else   await run(`INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)`,
                   [email.split('@')[0],email,hash,'patient','approved']);
  res.type('text').send(`OK. Try logging in: ${email} / ${pw}`);
});
module.exports=router;
