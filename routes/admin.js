const express = require('express');
const bcrypt = require('bcryptjs');
const { run, get, all } = require('../db');

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Admin access required.');
  }
  next();
};

router.get('/admin/seed', async (req, res) => {
  try {
    const existing = await get('SELECT id FROM users WHERE email = ?', [
      'admin@nirnoy.local',
    ]);
    if (existing) {
      return res.send('Admin already exists.');
    }
    const passwordHash = await bcrypt.hash('admin123', 10);
    const createdAt = new Date().toISOString();
    await run(
      `INSERT INTO users (name, email, password_hash, role, status, created_at)
       VALUES (?, ?, ?, 'admin', 'active', ?)`,
      ['Admin', 'admin@nirnoy.local', passwordHash, createdAt]
    );
    res.send('Admin user created.');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to seed admin.');
  }
});

router.get('/admin/doctors', requireAdmin, async (req, res) => {
  try {
    const doctors = await all(
      `SELECT u.id as user_id, u.name, u.email, u.status, d.bmdc_no, d.specialty, d.chamber
       FROM users u
       JOIN doctors d ON u.id = d.user_id
       ORDER BY u.created_at DESC`
    );
    const pending = doctors.filter((doc) => doc.status === 'pending');
    const approved = doctors.filter((doc) => doc.status === 'approved');
    res.render('admin_doctors', { pending, approved });
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to load doctors.');
  }
});

router.post('/admin/doctors/:userId/approve', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    await run('UPDATE users SET status = ? WHERE id = ?', ['approved', userId]);
    res.redirect('/admin/doctors');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update doctor.');
  }
});

router.post('/admin/doctors/:userId/reject', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    await run('UPDATE users SET status = ? WHERE id = ?', ['rejected', userId]);
    res.redirect('/admin/doctors');
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to update doctor.');
  }
});

module.exports = router;
