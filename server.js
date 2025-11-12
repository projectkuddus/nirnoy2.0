const express=require('express');
const path=require('path');
const session=require('express-session');
const methodOverride=require('method-override');
require('./db'); // init DB & schema

const app=express();
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));
app.use(express.urlencoded({extended:true}));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname,'public')));
app.use(session({secret:'nirnoy-secret',resave:false,saveUninitialized:false}));
app.use((req,res,next)=>{res.locals.user=req.session.user||null;next();});

// routes
app.use(require('./routes/auth')); // patient auth

app.get('/',(req,res)=>{res.render('home');});
app.listen(3000,()=>console.log('Nirnoy 2.0 running at http://localhost:3000'));
