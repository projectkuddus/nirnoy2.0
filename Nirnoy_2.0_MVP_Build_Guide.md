# Nirnoy 2.0 — MVP PRD (buildable by a 15-year-old with Codex)

## 1) Goal (single loop)

Let any patient book a serial with an approved doctor, fill a pre-visit form, see live queue/ETA, meet doctor, receive prescription/tasks, and keep full history. Doctors manage schedule, today’s queue, notes/prescriptions. Admin approves doctors. That’s it.

## 2) Scope (MVP)

* Roles: **Patient**, **Doctor**, **Admin** (Nirnoy).
* Doctor onboarding: signup → **admin approval required** (BMDC reg no, specialty, chamber).
* Patient: one login, can add **family profiles** under the same account and book for them.
* Booking: pick doctor/date/slot → **serial number assigned & locked** (no double booking).
* Pre-visit form: defined per doctor (JSON schema; MVP can be a fixed set of fields).
* Live queue: statuses `booked → arrived → waiting → in_consultation → completed / no_show`. Patient sees **now serving**, their **serial**, and **ETA**.
* Doctor dashboard: today’s queue with start/complete/no-show; capture notes + prescription + optional tasks (text).
* Patient dashboard: all appointments, forms, prescriptions, tasks.
* Cancel/reschedule (simple).
* Notifications: **placeholders** (show on screen); real SMS/email later.
* Audit: minimal (created_at timestamps).

**Out of scope (MVP):** payments, e-prescription integrations, pharmacy/lab integrations, real SMS/email, advanced AI triage, multi-clinic chains, mobile app (we’ll reuse same routes later).

## 3) Success metrics (for MVP)

* Book → confirm in < 30s.
* Queue updates reflect doctor actions within 30s (poll).
* Zero double bookings per slot.
* Admin can approve a doctor in < 1 min.
* Happy path test suite (below) passes end-to-end.

## 4) System & Stack (LOCKED)

* **Backend:** Node.js + Express
* **Views:** EJS (no React in MVP)
* **DB:** SQLite (file `nirnoy.db`)
* **Auth:** sessions + bcrypt password hashing
* **Hosting (later):** Render/Railway; local first
* **Dev helpers:** nodemon, method-override
* **Folder:**

  ```
  nirnoy2/
    server.js
    db.js
    /routes (auth.js, doctors.js, patients.js, appointments.js, admin.js)
    /views (...see below)
    /public/css/style.css
    package.json
    nirnoy.db (auto-created)
  ```

## 5) Data model (tables)

* **users**(id, name, email UNIQUE, password_hash, role['patient'|'doctor'|'admin'], status['pending'|'approved'|'rejected'|'active'], created_at)
* **doctors**(id, user_id FK, bmdc_no, specialty, chamber, visit_duration_minutes INT, max_per_day INT)
* **schedules**(id, doctor_id FK, day_of_week INT, start_time TEXT, end_time TEXT)  *MVP: seed one simple weekday range*
* **appointments**(id, doctor_id FK, patient_id FK, for_person_name TEXT, date TEXT, slot_time TEXT, serial_no INT, status TEXT, created_at)
* **questionnaires**(id, doctor_id FK, schema_json TEXT)  *MVP: null → show fixed form fields*
* **appointment_answers**(id, appointment_id FK, answers_json TEXT)
* **consultations**(id, appointment_id FK, notes TEXT, prescription_text TEXT, tasks_json TEXT)

## 6) Business rules

* **Doctor visibility:** only users with role='doctor' **and** status='approved' listable/bookable.
* **Serial assignment:** `serial_no = count(active appointments for doctor/date) + 1`. Active = not `cancelled`/`no_show`.
* **Double booking prevention:** reject if same doctor/date/slot_time already has an active appointment.
* **ETA:** `ETA = clinic_start_time + (serial_no-1)*visit_duration_minutes`; recalc when doctor marks pause/late (MVP: a simple +X minutes button).
* **Family profiles:** booking stores `for_person_name`.
* **AuthZ:** Patients see only their (and family) data; doctors see only their own patients; admin sees all.
* **Cancel/reschedule:** patient can cancel → frees slot; reschedule = cancel + new booking.

## 7) Primary flows (acceptance criteria)

1. **Patient books**

   * Can list approved doctors, open a doctor page, choose date/slot, submit → gets serial + confirm page.
   * Attempt to double book same slot → error shown.
2. **Pre-visit form**

   * After booking, form page appears; answers saved and visible to doctor.
3. **Doctor runs clinic**

   * Doctor dashboard shows today list ordered by serial; Start/Complete/No-show buttons work and update statuses.
4. **Live queue**

   * Patient status page shows now-serving serial & ETA that changes within 30s after doctor action.
5. **Records**

   * Patient dashboard lists all visits; each visit shows booking info, answers, prescription, tasks.
6. **Admin approval**

   * Admin sees pending doctors, can approve; approved doctor becomes visible to patients.

## 8) Screens (minimum)

* **Home**: links to Login/Register, Find Doctors.
* **Auth**: Register (patient), Login; Doctor Register (separate page adds BMDC no & specialty).
* **Doctors List** (approved only); **Doctor Detail** with simple booking form.
* **Appointment Confirm** (serial, date, check-in code) + link “Fill Form” + “View Status”.
* **Appointment Status** (now serving, your serial, ETA; auto refresh).
* **Patient Dashboard** (history + details).
* **Doctor Dashboard** (today queue; start/complete/no-show; form answers inline; prescription/notes form).
* **Admin Doctors** (pending/approved; approve/reject).

## 9) Non-functional

* Performance target: 1 clinic / 100 appts/day.
* Reliability: Git snapshots after each step; rollback guide (below).
* Backup: manual copy of `nirnoy.db` file.
* Privacy: password hashed; minimal PII; add Terms/Privacy static pages.

---

# Build plan (copy-paste prompts for Codex)

> **Rule:** After each step works in the browser, run
> `git add . && git commit -m "Step X done"`
> If stuck: copy the error text to Codex with “Fix only what’s needed in the mentioned file; don’t rewrite the project.”

## Step 0 — Project init (terminal)

```
mkdir nirnoy2 && cd nirnoy2
npm init -y
npm install express ejs sqlite3 express-session bcryptjs method-override
npm install --save-dev nodemon
```

Edit `package.json` → `"scripts": { "dev": "nodemon server.js" }`

## Step 1 — Base server & home view (Codex prompt)

**Prompt A:**
“Create `server.js` exactly as below; don’t change other files:

````js
const express=require('express');const path=require('path');
const session=require('express-session');const methodOverride=require('method-override');
const app=express();app.set('view engine','ejs');app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true}));app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname,'public')));
app.use(session({secret:'nirnoy-secret',resave:false,saveUninitialized:false}));
app.use((req,res,next)=>{res.locals.user=req.session.user||null;next();});
app.get('/',(req,res)=>{res.render('home');});
app.listen(3000,()=>console.log('Nirnoy 2.0 running at http://localhost:3000'));
```”
  
**Prompt B:**  
“Create folder `views` and file `views/home.ejs` with:
```html
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Nirnoy 2.0</title></head>
<body><h1>Nirnoy 2.0 is running ✅</h1></body></html>
```”

Run: `npm run dev` → open `http://localhost:3000`

## Step 2 — DB schema (Codex prompt)
**Prompt:**  
“Create `db.js` that opens `nirnoy.db` with sqlite3 and creates these tables if not exist:
users(id INTEGER PK, name TEXT, email TEXT UNIQUE, password_hash TEXT, role TEXT, status TEXT, created_at TEXT);
doctors(id INTEGER PK, user_id INTEGER, bmdc_no TEXT, specialty TEXT, chamber TEXT, visit_duration_minutes INTEGER, max_per_day INTEGER);
schedules(id INTEGER PK, doctor_id INTEGER, day_of_week INTEGER, start_time TEXT, end_time TEXT);
appointments(id INTEGER PK, doctor_id INTEGER, patient_id INTEGER, for_person_name TEXT, date TEXT, slot_time TEXT, serial_no INTEGER, status TEXT, created_at TEXT);
questionnaires(id INTEGER PK, doctor_id INTEGER, schema_json TEXT);
appointment_answers(id INTEGER PK, appointment_id INTEGER, answers_json TEXT);
consultations(id INTEGER PK, appointment_id INTEGER, notes TEXT, prescription_text TEXT, tasks_json TEXT).
Export helpers `run(sql,params)`, `get(sql,params)`, `all(sql,params)`.”

Add `const db=require('./db');` at top of `server.js` (Codex can do).

## Step 3 — Auth (patients) (Codex prompt)
**Prompt:**  
“Create `routes/auth.js` with routes:
GET `/register`, POST `/register` (role='patient', status='active', bcrypt password),  
GET `/login`, POST `/login` (sets `req.session.user`),  
GET `/logout` (destroy session).  
Export router and mount in `server.js` with `app.use(require('./routes/auth'))`.  
Create simple EJS views `login.ejs` and `register.ejs`.”

Test: register, login, logout.

## Step 4 — Admin seed + doctor signup/approval (Codex prompt)
**Prompt:**  
“Create `routes/admin.js`:
- One-time GET `/admin/seed` creates admin user (email `admin@nirnoy.local`, pwd `admin123`, role='admin', status='active') if not exists.
- Middleware `requireAdmin` (checks session role).
- GET `/admin/doctors` lists pending/approved doctors with buttons approve/reject.
- POST `/admin/doctors/:userId/approve` → set users.status='approved'; reject sets 'rejected'.
Mount in `server.js`.”

**Doctor signup page** (in `routes/auth.js`):  
GET `/doctor/register`, POST `/doctor/register` → create user role='doctor', status='pending' + row in `doctors` (bmdc_no, specialty, chamber, default visit_duration_minutes=10). Show “Pending admin approval.”  
Create views `doctor_register.ejs`, `admin_doctors.ejs`.

Visit `/admin/seed` once, then approve a test doctor.

## Step 5 — Doctors list/detail (Codex prompt)
**Prompt:**  
“Create `routes/doctors.js`:
- GET `/doctors` lists users with role='doctor' AND status='approved' (join doctors).
- GET `/doctors/:id` shows doctor details and a simple booking form (date, slot_time text, for_person_name optional).
Mount router. Create `doctors_list.ejs` & `doctor_detail.ejs`.”

## Step 6 — Booking & serial lock (Codex prompt)
**Prompt:**  
“Create `routes/appointments.js` with middleware `requireLogin`.  
POST `/appointments/book`:
- body: doctor_id, date, slot_time, for_person_name
- verify doctor is approved
- if any active appointment exists for same doctor/date/slot_time → render error
- serial_no = count(active appointments for that doctor/date) + 1
- insert appointment status='booked'
- redirect to GET `/appointments/:id/confirm`
GET `/appointments/:id/confirm` shows doctor, date, slot_time, serial_no and buttons to ‘Fill Form’ and ‘View Status’.
Mount router. Create views `appointment_confirm.ejs` and an `error.ejs` for simple errors.”

Test: create 2 bookings same slot → second must fail.

## Step 7 — Pre-visit form (Codex prompt)
**Prompt:**  
“Extend `appointments.js`:
GET `/appointments/:id/form` (only owner patient) → render `appointment_form.ejs` with fields: symptoms, duration, medications.  
POST `/appointments/:id/form` saves JSON into `appointment_answers` then back to confirm page.”

## Step 8 — Doctor dashboard & queue (Codex prompt)
**Prompt:**  
“In `routes/doctors.js` add `requireDoctor`.  
Add:
GET `/dashboard/doctor` → today’s appointments ordered by serial_no with inline answers preview + action buttons.  
POST `/doctor/appointments/:id/arrived` → status='waiting'  
POST `/doctor/appointments/:id/start` → status='in_consultation'  
POST `/doctor/appointments/:id/complete` → body: notes, prescription_text, tasks_json; upsert into `consultations`; status='completed'  
POST `/doctor/appointments/:id/no-show` → status='no_show'  
Create `dashboard_doctor.ejs`.”

## Step 9 — Live status/ETA (Codex prompt)
**Prompt:**  
“In `routes/appointments.js` add GET `/appointments/:id/status` returning JSON: your_serial, current_serving_serial, status, eta.  
ETA = first appointment’s slot_time + (your_serial-1)*visit_duration_minutes (from doctors table).  
Create `appointment_status.ejs` that polls this JSON every 30s and updates UI.”

## Step 10 — Patient dashboard & details (Codex prompt)
**Prompt:**  
“Create `routes/patients.js`:
GET `/dashboard/patient` → list all appointments for logged-in patient (and for_person_name); link to detail.  
GET `/appointments/:id/detail` → if belongs to patient, show booking info, answers, consultation (prescription & tasks).  
Mount router; create `dashboard_patient.ejs` and `appointment_detail.ejs`.”

---

# Test checklist (happy path)
1. Admin seed → login as admin → approve a doctor.
2. Register as patient → login → list doctors → open detail.
3. Book slot → see confirm with serial.
4. Fill pre-visit form.
5. Open status page; in another browser login as doctor → mark arrived/start/complete; patient status updates within 30s.
6. Patient dashboard shows visit + prescription/tasks.

# “Never stuck” playbook (for the 15-year-old)
- After each working step:
````

git init (first time only)
git add .
git commit -m "Step X done"

```
- If something breaks:
- Copy the **full** red error → paste to Codex:  
  “I’m on Step X; fix only what’s needed in the mentioned file. Don’t rewrite the project.”
- If you want to revert to last good state:
```

git reset --hard HEAD
npm run dev

```
- Always run from the **nirnoy2** folder. Check with `pwd`.  
- Don’t click “Build workspace” or accept giant rewrites.

---

**Definition of Done (MVP):**
- All flows in the test checklist pass.
- No double booking.
- Admin approval gating works.
- Doctor can run a full clinic session end-to-end.
- Patient can read history, prescriptions, tasks.
- Code lives in one folder `nirnoy2` and starts with `npm run dev`.

When you’re ready, say “Go Step 0” and we’ll execute the prompts one by one.
::contentReference[oaicite:0]{index=0}
```
