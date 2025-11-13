const express=require('express'),path=require('path'),fs=require('fs');
const session=require('express-session'),methodOverride=require('method-override');
require('./db');
const app=express();

// ensure uploads folder exists
const UP=path.join(__dirname,'uploads');
try{fs.mkdirSync(UP,{recursive:true});}catch(_){}

app.set('view engine','ejs');app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true}));app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname,'public')));
app.use('/uploads',express.static(UP)); // serve uploaded BMDC docs
app.use(session({secret:'nirnoy-secret',resave:false,saveUninitialized:false}));
app.use((req,res,next)=>{res.locals.user=req.session.user||null;next();});

app.use(require('./routes/auth'));          // patient auth
app.use(require('./routes/admin'));         // admin tools
app.use(require('./routes/doctor'));        // doctor register
app.use(require('./routes/doctors'));       // list/detail
app.use(require('./routes/appointments'));  // booking + status + questionnaire
app.use(require('./routes/doctor_portal')); // doctor dashboard/schedule
app.use(require('./routes/patients'));      // patient dashboard

app.get('/debug/outbox', (req,res)=>{
  const p = path.join(__dirname,'outbox.log');
  if(!fs.existsSync(p)) return res.type('text').send('(empty)');
  res.type('text').send(fs.readFileSync(p,'utf8'));
});
app.get('/debug/me',(req,res)=>{res.type('json').send(JSON.stringify(req.session.user||{},null,2));});
app.get('/',(req,res)=>res.render('home'));
// background jobs (reminders)
require('./jobs');

app.listen(3000,()=>console.log('Nirnoy 2.0 running at http://localhost:3000'));
