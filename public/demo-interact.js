(function(){
'use strict';
// Shared DEMO interactivity: forms submit in-memory (nothing is saved/sent),
// buttons/links give realistic feedback. Refresh/close = everything gone.
function toast(msg,color){const t=document.createElement('div');t.textContent=msg;
 t.style.cssText='position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:'+(color||'#0b9e6f')+';color:#fff;padding:13px 26px;border-radius:12px;font-weight:800;z-index:100001;box-shadow:0 14px 36px rgba(0,0,0,.32);font-size:14px;max-width:92vw;text-align:center;font-family:"Hind Siliguri",system-ui,sans-serif';
 document.body.appendChild(t);setTimeout(()=>{t.style.transition='opacity .4s';t.style.opacity='0';setTimeout(()=>t.remove(),400);},2800);}
const pill=document.createElement('div');
pill.textContent='🧪 এটি একটি ডেমো — আপনার দেওয়া তথ্য শুধু এই ট্যাবের মেমোরিতে থাকে; রিফ্রেশ বা পেজ বন্ধ করলেই মুছে যায়, কোথাও সেভ/পাঠানো হয় না।';
pill.style.cssText='position:fixed;bottom:8px;left:50%;transform:translateX(-50%);background:rgba(20,24,32,.92);color:#fff;padding:7px 14px;border-radius:999px;font-size:11px;font-weight:700;z-index:100000;box-shadow:0 6px 20px rgba(0,0,0,.3);max-width:94vw;text-align:center;font-family:"Hind Siliguri",system-ui,sans-serif';
document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(pill));
if(document.body)document.body.appendChild(pill);
// forms -> in-memory
document.addEventListener('submit',e=>{e.preventDefault();const f=e.target;
 let n='';try{const fi=f.querySelector('input[name],input[type=text],input[type=email],input:not([type])');if(fi)n=fi.value?(' ('+String(fi.value).split(' ')[0]+')'):'';}catch(_){}
 toast('✅ ধন্যবাদ! আপনার তথ্য ডেমোতে গ্রহণ করা হয়েছে'+n+' — এটি শুধু এই পেজে দেখানো হচ্ছে, কোথাও সেভ হয়নি।');
 try{f.reset();}catch(_){}},true);
// buttons & fake links -> feedback
document.addEventListener('click',e=>{
 const b=e.target.closest('button, .btn, [class*="button"], a');
 if(!b)return;
 if(b.tagName==='A'){
  const href=b.getAttribute('href')||'';
  if(href&&href!=='#'&&href.indexOf('http')===0&&href.indexOf(location.host)<0)return; // external real link allowed
  if(b.target==='_blank'&&/\/demos\/|^https?:/.test(href))return; // real demo links
  if(href&&href!=='#'&&href.indexOf('#')!==0&&!/^javascript:/.test(href))return;
 }
 if(b.closest('nav')&&b.tagName==='A'&&b.getAttribute('href')&&b.getAttribute('href')!=='#'){/* allow on-page anchors */}
 const txt=(b.textContent||'').trim().slice(0,28);
 const buy=/কিন|অর্ডার|বুক|রিজার্ভ|নিবন্ধন|ভর্তি|অ্যাপয়েন্ট|সাবস্ক্র|শুরু|যোগ|সাইন|লগ|যোগাযোগ|মেসেজ|পাঠা|সাবমিট|সার্চ|খুঁজে|কল|ডাক্তার|পরামর্শ/.test(txt);
 const c=/কিন|অর্ডার|বুক|রিজার্ভ|নিবন্ধন|ভর্তি/.test(txt)?'#e8590c':'#0b9e6f';
 if(b.tagName==='A'&&(b.getAttribute('href')==='#'||/^javascript:/.test(b.getAttribute('href')||''))){
   e.preventDefault();
   if(txt)toast((buy?'✅ ':'🔘 ') + (txt?('"'+txt+'" '):'') + 'কাজ করছে — ডেমো মোডে এটি শুধু স্ক্রিনে দেখানো হয়', c);
 } else if(b.tagName==='BUTTON'){
   const t=b.getAttribute('type');
   if(t!=='submit'){ if(txt)toast('🔘 "'+txt+'" — ডেমো অ্যাকশন (কোনো ডেটা সেভ হয়নি)',c);}
 }
},true);
})();
