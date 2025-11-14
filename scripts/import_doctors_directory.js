// scripts/import_doctors_directory.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const db = require('../db'); // sqlite connection from db.js

function normalizeRow(raw) {
  const cleaned = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key) continue;
    const cleanKey = key
      .replace(/^\uFEFF/, '') // strip BOM if present
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_'); // "Full Name" -> "full_name"
    cleaned[cleanKey] = typeof value === 'string' ? value.trim() : value;
  }
  return cleaned;
}

async function upsertDoctorDirectory(doc) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO doctor_directory (
        full_name, specialty, hospital_name, area, phone, source, raw_id,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      [
        doc.full_name,
        doc.specialty,
        doc.hospital_name,
        doc.area,
        doc.phone,
        doc.source,
        doc.raw_id
      ],
      function (err) {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
}

async function run() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node scripts/import_doctors_directory.js path/to/dhaka_doctors.csv');
    process.exit(1);
  }

  const absPath = path.resolve(csvPath);
  if (!fs.existsSync(absPath)) {
    console.error('CSV file not found:', absPath);
    process.exit(1);
  }

  console.log('Importing doctors from', absPath);

  const parser = fs
    .createReadStream(absPath)
    .pipe(
      parse({
        columns: true,
        trim: true,
        skip_empty_lines: true
      })
    );

  let count = 0;

  for await (const rawRow of parser) {
    const row = normalizeRow(rawRow);

    const full_name = row.full_name || '';
    if (!full_name) {
      continue;
    }

    const specialty = row.specialty || null;
    const hospital_name = row.hospital_name || null;
    const area = row.area || null;
    const phone = row.phone || null;
    const source = row.source || 'Imported CSV';
    const raw_id = row.raw_id || null;

    await upsertDoctorDirectory({
      full_name,
      specialty,
      hospital_name,
      area,
      phone,
      source,
      raw_id
    });

    count++;
    if (count % 20 === 0) {
      console.log('Imported', count, 'rows…');
    }
  }

  console.log('Done. Total rows processed:', count);
  process.exit(0);
}

run().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
