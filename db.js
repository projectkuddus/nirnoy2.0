const path=require('path');
const sqlite3=require('sqlite3').verbose();
const db=new sqlite3.Database(path.join(__dirname,'nirnoy.db'));

function run(sql,params=[]){return new Promise((res,rej)=>{db.run(sql,params,function(e){if(e)rej(e);else res({id:this.lastID,changes:this.changes});});});}
function get(sql,params=[]){return new Promise((res,rej)=>{db.get(sql,params,(e,row)=>e?rej(e):res(row));});}
function all(sql,params=[]){return new Promise((res,rej)=>{db.all(sql,params,(e,rows)=>e?rej(e):res(rows));});}

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,email TEXT UNIQUE,password_hash TEXT,
    role TEXT CHECK(role IN('patient','doctor','admin')) NOT NULL,
    status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);  
  db.run(`CREATE TABLE IF NOT EXISTS doctors(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,bmdc_no TEXT,specialty TEXT,chamber TEXT,
    visit_duration_minutes INTEGER DEFAULT 10,max_per_day INTEGER DEFAULT 40)`);  
  db.run(`CREATE TABLE IF NOT EXISTS schedules(
    id INTEGER PRIMARY KEY AUTOINCREMENT,doctor_id INTEGER,day_of_week INTEGER,start_time TEXT,end_time TEXT)`);  
  db.run(`CREATE TABLE IF NOT EXISTS appointments(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id INTEGER,patient_id INTEGER,for_person_name TEXT,
    date TEXT,slot_time TEXT,serial_no INTEGER,status TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);  
  db.run(`CREATE TABLE IF NOT EXISTS questionnaires(
    id INTEGER PRIMARY KEY AUTOINCREMENT,doctor_id INTEGER,schema_json TEXT)`);  
  db.run(`CREATE TABLE IF NOT EXISTS appointment_answers(
    id INTEGER PRIMARY KEY AUTOINCREMENT,appointment_id INTEGER,answers_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);  
  db.run(`CREATE TABLE IF NOT EXISTS consultations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,appointment_id INTEGER,notes TEXT,prescription_text TEXT,tasks_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);  
});
module.exports={db,run,get,all};
