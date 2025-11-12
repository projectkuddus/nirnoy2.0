const express=require('express'),path=require('path');
const session=require('express-session'),methodOverride=require('method-override');
require('./db');
const app=express();
app.set('view engine','ejs');app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true}));app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname,'public')));
app.use(session({secret:'nirnoy-secret',resave:false,saveUninitialized:false}));
app.use((req,res,next)=>{res.locals.user=req.session.user||null;next();});

app.use(require('./routes/auth'));          // patient auth
app.use(require('./routes/admin'));         // admin tools
app.use(require('./routes/doctor'));        // doctor register
app.use(require('./routes/doctors'));       // list/detail
app.use(require('./routes/appointments'));  // booking + status
app.use(require('./routes/doctor_portal')); // NEW: doctor dashboard
app.use(require('./routes/patients'));      // NEW: patient dashboard

app.get('/',(req,res)=>res.render('home'));
app.listen(3000,()=>console.log('Nirnoy 2.0 running at http://localhost:3000'));
