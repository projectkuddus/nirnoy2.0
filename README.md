# Nirnoy 2.0 — Local Dev Guide (MVP)

## Run
1. Open VS Code → File → Open Folder → select `nirnoy2`.
2. Terminal: `npm run dev`
3. App: http://localhost:3000

## First logins (dev)
Open in browser:
- `/dev/seed_admin` → makes admin user: `admin@nirnoy.local / admin123`
- `/dev/demo` → adds a demo doctor, patient, clinic, schedule, and an appointment for today  
  Doctor: `doc1@nirnoy.local / doc123`  
  Patient: `pat1@nirnoy.local / pat123`

Utilities:
- `/dev/setpw?email=someone@x&pw=newpass` — set any password
- `/dev/promote?email=someone@x` — make admin
- `/dev/status` — see table counts

## Roles & main pages
- Patient: `/patient/dashboard`, `/doctors`, `/book?doctorId=ID`, appointment **intake** form
- Doctor: `/doctor/dashboard`, `/doctor/clinics`, `/doctor/schedule`, `/doctor/intake`
- Admin: `/admin/doctors` (approve, edit fee/duration/BMDC)

## Clinics & booking
- Doctor → add clinics → set **per-clinic** weekly schedule
- Patient → **Book** → choose clinic → date → slot

## Intake loop
Doctor defines questions → patient fills after booking → doctor sees answers on visit page → doctor writes diagnosis/prescription.

## Pause / Resume
- Stop: press `Ctrl + C` in terminal (or close VS Code).
- Start later: open folder again → `npm run dev`.
- Save work:

(Optional) create a zip backup of the whole `nirnoy2` folder.

## Sanity check
`npm run check` — verifies key files and DB tables, prints row counts.

## If locked out
Use `/dev/setpw?email=...&pw=...` or re-seed `/dev/seed_admin`.

## Known next features (not installed yet)
13) Mobile polish + doctor photo upload  
14) Visit bundle PDF (prescription + intake + files list)  
16) Email/SMS reminders
