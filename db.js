const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(path.join(__dirname, 'nirnoy.db'));

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function runSchemaFixes(database) {
  if (!database) {
    console.warn('[schema] No database handle provided for schema fixes');
    return;
  }
  const log = (msg) => console.log(`[schema] ${msg}`);
  const tableExists = async (name) =>
    !!(await get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [name]));

  // doctor_schedule table handling
  if (!(await tableExists('doctor_schedule'))) {
    if (await tableExists('schedules')) {
      await run('ALTER TABLE schedules RENAME TO doctor_schedule');
      log('Renamed schedules table to doctor_schedule');
    } else {
      await run(`
        CREATE TABLE IF NOT EXISTS doctor_schedule(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          doctor_id INTEGER,
          clinic_id INTEGER,
          day_of_week INTEGER,
          start_time TEXT,
          end_time TEXT,
          slot_length_minutes INTEGER DEFAULT 15
        )
      `);
      log('Created doctor_schedule table');
    }
  }

  const scheduleCols = await all('PRAGMA table_info(doctor_schedule)');
  const scheduleNames = scheduleCols.map((c) => c.name);
  if (!scheduleNames.includes('clinic_id')) {
    await run('ALTER TABLE doctor_schedule ADD COLUMN clinic_id INTEGER');
    log('Added doctor_schedule.clinic_id column');
  }

  const doctorCols=await all('PRAGMA table_info(doctors)');
  const doctorNames=doctorCols.map((c)=>c.name);
  if(!doctorNames.includes('running_late_minutes')){
    await run('ALTER TABLE doctors ADD COLUMN running_late_minutes INTEGER DEFAULT 0');
    log('Added doctors.running_late_minutes column');
  }

  // doctor_clinics table
  if (!(await tableExists('doctor_clinics'))) {
    await run(`
      CREATE TABLE IF NOT EXISTS doctor_clinics(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doctor_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        area TEXT,
        address TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    log('Created doctor_clinics table');
  }

  // appointments fixes
  const apptCols = await all('PRAGMA table_info(appointments)');
  const apptNames = apptCols.map((c) => c.name);
  if (!apptNames.includes('appt_date')) {
    await run('ALTER TABLE appointments ADD COLUMN appt_date TEXT');
    log('Added appointments.appt_date column');
    if (apptNames.includes('date')) {
      await run(`UPDATE appointments SET appt_date = date WHERE appt_date IS NULL OR appt_date = ''`);
      log('Backfilled appointments.appt_date from legacy date column');
    }
  }
  if (!apptNames.includes('clinic_id')) {
    await run('ALTER TABLE appointments ADD COLUMN clinic_id INTEGER');
    log('Added appointments.clinic_id column');
  }

  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_slot
    ON appointments (doctor_id, clinic_id, appt_date, slot_time)
  `);
  log('Ensured idx_appointments_unique_slot index exists');
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT CHECK(role IN('patient','doctor','admin')) NOT NULL,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS doctors(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      bmdc_no TEXT,
      specialty TEXT,
      chamber TEXT,
      visit_duration_minutes INTEGER DEFAULT 10,
      max_per_day INTEGER DEFAULT 40
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS schedules(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER,
      day_of_week INTEGER,
      start_time TEXT,
      end_time TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS appointments(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER,
      patient_id INTEGER,
      for_person_name TEXT,
      date TEXT,
      slot_time TEXT,
      serial_no INTEGER,
      status TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reminder_sent INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS questionnaires(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      doctor_id INTEGER,
      schema_json TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS appointment_answers(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER,
      answers_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS consultations(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER,
      notes TEXT,
      prescription_text TEXT,
      tasks_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

runSchemaFixes(db).catch((err) => console.error('[schema] failed to run fixes', err));

module.exports = { db, run, get, all };
