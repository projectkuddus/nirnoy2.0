# Nirnoy 2.0 — Code & DB Audit

## Project Tree (excluding node_modules/.git/uploads)
```
F .DS_Store
F .gitignore
F README.md
F db.js
F jobs.js
F nirnoy.db
F notify.js
F package-lock.json
F package.json
D public
D public/css
F public/css/style.css
D routes
F routes/admin_manage.js
F routes/appointments.js
F routes/auth.js
F routes/booking.js
F routes/clinics.js
F routes/dev_tools.js
F routes/doctor.js
F routes/doctor_photo.js
F routes/doctor_portal.js
F routes/doctors.js
F routes/files.js
F routes/migrate.js
F routes/migrate_fix_doctors_meta.js
F routes/migrate_step13.js
F routes/migrate_step15.js
F routes/migrate_step4.js
F routes/migrate_step5.js
F routes/migrate_step6.js
F routes/migrate_step8.js
F routes/migrate_step9.js
F routes/patients.js
D scripts
F scripts/audit_repo.js
F scripts/check_setup.js
F server.js
D utils
F utils/notifications.js
D views
F views/_flash.ejs
F views/_footer.ejs
F views/_header.ejs
F views/admin_doctors.ejs
F views/appointment_confirm.ejs
F views/appointment_detail.ejs
F views/appointment_files.ejs
F views/appointment_form.ejs
F views/appointment_intake.ejs
F views/appointment_questionnaire.ejs
F views/appointment_status.ejs
F views/booking_form.ejs
F views/consultation_edit.ejs
F views/consultation_view.ejs
F views/dashboard_doctor.ejs
F views/dashboard_patient.ejs
F views/doctor_clinics.ejs
F views/doctor_detail.ejs
F views/doctor_intake.ejs
F views/doctor_photo.ejs
F views/doctor_register.ejs
F views/doctor_schedule.ejs
F views/doctors_list.ejs
F views/error.ejs
F views/home.ejs
F views/login.ejs
F views/notice.ejs
D views/partials
F views/partials/flash.ejs
F views/partials/header.ejs
F views/register.ejs
```

## Routes Detected
### admin_manage.js
- GET /admin/seed
- GET /admin/doctors
- POST /admin/doctors/:uid/approve
- POST /admin/doctors/:uid/reject
- POST /admin/doctors/:uid/update

### appointments.js
- GET /appointments/:id/status
- GET /appointments/:id/eta.json

### auth.js
- GET /register
- POST /register
- GET /login
- POST /login
- GET /logout

### booking.js
- GET /book
- POST /book

### clinics.js
- GET /doctor/clinics
- POST /doctor/clinics/add
- POST /doctor/clinics/:id/update
- POST /doctor/clinics/:id/delete
- GET /doctor/schedule
- POST /doctor/schedule

### dev_tools.js
- GET /dev/seed_admin
- GET /dev/setpw
- GET /dev/promote
- GET /dev/demo
- GET /dev/status

### doctor.js
- GET /doctor/register
- POST /doctor/register

### doctor_photo.js
- GET /doctor/photo
- POST /doctor/photo

### doctor_portal.js
- GET /doctor/dashboard
- POST /doctor/appointments/:id/call
- POST /doctor/appointments/:id/start
- POST /doctor/appointments/:id/done
- POST /doctor/appointments/:id/noshow
- POST /doctor/appointments/:id/room
- POST /doctor/running-late
- GET /doctor/appointments/:id/edit
- POST /doctor/appointments/:id/update

### doctors.js
- GET /doctors
- GET /doctors/:id

### files.js
- GET /appointments/:id/files
- POST /appointments/:id/upload
- POST /appointments/:id/files/:fid/review

### migrate.js
- GET /migrate/step2
- GET /migrate/step4

### migrate_fix_doctors_meta.js
- GET /migrate/fix-doctors-meta

### migrate_step13.js
- GET /migrate/step13

### migrate_step15.js
- GET /migrate/step15

### migrate_step4.js
- GET /migrate/step4

### migrate_step5.js
- GET /migrate/step5

### migrate_step6.js
- GET /migrate/step6

### migrate_step8.js
- GET /migrate/step8

### migrate_step9.js
- GET /migrate/step9

### patients.js
- GET /patient/dashboard
- GET /consultations/appointment/:id

## package.json (scripts)
```json
{
  "dev": "nodemon server.js",
  "start": "node server.js",
  "check": "node scripts/selfcheck.js",
  "audit": "node scripts/audit_repo.js",
  "seed:admin": "node -e \"require('./routes/dev_tools');\" && echo 'Open /dev/seed_admin in browser'",
  "demo": "node -e \"require('./routes/dev_tools');\" && echo 'Open /dev/demo in browser'"
}
```
## DB Tables

- appointment_answers
- appointment_files
- appointments
- consultations
- doctors
- questionnaires
- schedules
- sqlite_sequence
- users

### appointment_answers
- id (INTEGER)
- appointment_id (INTEGER)
- answers_json (TEXT)

### consultations
- id (INTEGER)
- appointment_id (INTEGER)
- notes (TEXT)
- prescription_text (TEXT)
- tasks_json (TEXT)

### questionnaires
- id (INTEGER)
- doctor_id (INTEGER)
- schema_json (TEXT)

### schedules
- id (INTEGER)
- doctor_id (INTEGER)
- day_of_week (INTEGER)
- start_time (TEXT)
- end_time (TEXT)

### sqlite_sequence
- name ()
- seq ()

### users
- id (INTEGER)
- name (TEXT)
- email (TEXT)
- password_hash (TEXT)
- role (TEXT)
- status (TEXT)
- created_at (TEXT)

### appointments
- id (INTEGER)
- doctor_id (INTEGER)
- patient_id (INTEGER)
- for_person_name (TEXT)
- date (TEXT)
- slot_time (TEXT)
- serial_no (INTEGER)
- status (TEXT)
- created_at (TEXT)

### doctors
- id (INTEGER)
- user_id (INTEGER)
- bmdc_no (TEXT)
- specialty (TEXT)
- chamber (TEXT)
- visit_duration_minutes (INTEGER)
- max_per_day (INTEGER)
- area (TEXT)
- fee (TEXT)

### appointment_files
- id (INTEGER)
- appointment_id (INTEGER)
- uploader_id (INTEGER)
- kind (TEXT)
- note (TEXT)
- filepath (TEXT)
- reviewed (INTEGER)
- created_at (TEXT)

Rows: 0

Rows: 0

Rows: 0

Rows: 2

Rows: 0

Rows: 5

Rows: 0

Rows: 1

Rows: 0
