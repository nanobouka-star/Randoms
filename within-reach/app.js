const $=s=>document.querySelector(s);
const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ALL=[1,2,3,4,5,6,7,8,9,10,11,12];
/* Trip times are Qatar wall-clock times (UTC+3, no daylight saving). qatarNow() gives the current Qatar time
   in the same form, so comparisons with 'now' are right wherever the visitor is. */
const qatarNow=()=>new Date(Date.now()+(180+new Date().getTimezoneOffset())*60000);
const fmtQ=n=>'QAR '+Math.round(n).toLocaleString('en-US');

/* ---------- content (data/*.json) ---------- */
const getJSON=u=>fetch(u).then(r=>{if(!r.ok)throw new Error(u+' '+r.status);return r.json()});
Promise.all(['data/experiences.json','data/events.json','data/content.json','data/khalid.json'].map(getJSON))
 .then(([exp,events,content,khalid])=>start(exp,events,content,khalid))
 .catch(err=>{console.error(err);const m=document.createElement('p');m.className='loadErr';m.setAttribute('role','alert');
  m.textContent='The trip data did not load. Serve this folder over HTTP (for example: npm start) instead of opening the file directly.';document.body.prepend(m)});

function start(EXP,EVENTS,C,KHALID){
const RAMADAN=(C.ramadan||[]).map(r=>[new Date(r.from+'T00:00'),new Date(r.to+'T23:59')]),inRamadan=d=>RAMADAN.some(([f,t])=>d>=f&&d<=t),CLIMATE=C.climate||{},PARTY=C.party,MOODS=C.moods,SLOT=C.slots,SLOTNAME=C.slotNames,SEASON=C.season;

Object.values(EXP).forEach(e=>{if(e.windows)e.ranges=e.windows.map(([f,t])=>[new Date(f+'T00:00'),new Date(t+'T23:59')])});
EVENTS.forEach(e=>{EXP[e.id]={...e,ev:1,months:ALL,dur:'Event',op:e.real?'Tickets via official seller':'Sample event · tickets on sale soon',range:[new Date(e.from+'T00:00'),new Date(e.to+'T23:59')]}});

/* ---------- state ---------- */
const S={rolled:false,name:'',tel:'',arr:null,dep:null,party:'couple',adults:2,kids:0,moods:new Set(['explore','wild']),timer:true,rows:[],scenes:[],idx:0,hist:[]};
const pad=n=>String(n).padStart(2,'0');
const toLocal=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
(function initDates(){const d=qatarNow();const add=(4-d.getDay()+7)%7||7;const a=new Date(d.getFullYear(),d.getMonth(),d.getDate()+add,6,40);S.arr=a;S.dep=new Date(a.getTime()+65*3600e3+15*60e3)})();

/* ---------- planning ---------- */
const hours=()=>Math.round((S.dep-S.arr)/3600e3);
const hasKids=()=>S.kids>0||S.party==='little'||S.party==='teens';
function slotStart(row,id){const e=EXP[id];const t=new Date(row.when);if(e&&e.start)t.setHours(e.start[0],e.start[1]);return t}
function why(row,id){
 const e=EXP[id];if(!e)return 'unknown';
 if(!e.slots.includes(row.type))return 'slot';
 if(e.range){if(row.when<e.range[0]||row.when>e.range[1])return 'dates'}
 else if(!e.months.includes(row.when.getMonth()+1))return 'season';
 else if(e.ranges&&!e.ranges.some(([f,t])=>row.when>=f&&row.when<=t))return 'dates';
 if(id==='whale'&&slotStart(row,id)<new Date(S.arr.getTime()+2.5*3600e3))return 'time';
 if(id==='stars'&&S.party==='work')return 'party';
 if(id==='dhow'&&row.type!=='evening'&&inRamadan(row.when))return 'ramadan';
 return '';
}
const ok=(row,id)=>!why(row,id);
function score(id,row,moods=S.moods){const e=EXP[id];if(e.free)return -1;let s=0;e.moods.forEach(m=>{if(moods.has(m))s+=3});if(e.rare)s+=1.5;if(e.ev)s+=2.5;if(e.best&&e.best.includes(row.when.getMonth()+1))s+=.5;
 if(hasKids()&&(id==='stars'||id==='race'))s-=2;if(S.party==='work'&&row.type!=='evening')s-=1;if(S.party==='event'&&(id==='race'||e.ev))s+=2;if(S.party==='solo'&&id==='spa')s-=.5;return s}
function buildRows(){
 const rows=[];const d=new Date(S.arr);d.setHours(0,0,0,0);
 const earliest=S.arr.getTime()+2.5*3600e3,latest=S.dep.getTime()-3*3600e3;let n=0;
 while(d.getTime()<=S.dep.getTime()&&n<60){
  for(const type of ['morning','golden','evening']){const t=new Date(d);t.setHours(...SLOT[type]);const tt=t.getTime();
   if(tt>=earliest&&tt+3*3600e3<=latest)rows.push({type,when:t,pick:'rest'});
  }
  d.setDate(d.getDate()+1);n++}
 return rows;
}
function plan(){
 S.rows=buildRows();S.scenes=[];const used=new Set();
 S.rows.forEach((row,ri)=>{
  const c=Object.keys(EXP).filter(id=>!EXP[id].free&&!used.has(id)&&ok(row,id)).sort((a,b)=>score(b,row)-score(a,row));
  if(!c.length)return;
  const a=c[0];const b=c.find(x=>x!==a&&(!!EXP[x].rare||!!EXP[x].ev)!==(!!EXP[a].rare||!!EXP[a].ev))||c[1]||'rest';
  if(S.scenes.length<6&&!(S.party==='work'&&row.type==='morning'&&row.when.getDay()>=0&&row.when.getDay()<=4)){S.scenes.push({ri,opts:[a,b]});used.add(a);used.add(b);row.pick=a}
  else{row.pick=S.party==='work'&&row.type!=='evening'?'rest':(score(a,row)>=3?a:'rest');if(row.pick!=='rest')used.add(row.pick)}
 });
 // avoid duplicates in non-scene rows
 const seen=new Set();S.rows.forEach(r=>{if(r.pick!=='rest'&&seen.has(r.pick))r.pick='rest';seen.add(r.pick)});
}
const dayN=d=>Math.floor((new Date(d).setHours(0,0,0,0)-new Date(S.arr).setHours(0,0,0,0))/864e5)+1;
const tc=(row,id)=>{const t=slotStart(row,id||row.pick);return 'DAY '+dayN(row.when)+' · '+pad(t.getHours())+':'+pad(t.getMinutes())};

/* ---------- views ---------- */
const VIEWS=['vWelcome','vIntro','vTitle','vSetup','vScene','vEnd','vPay'];
function show(v){VIEWS.forEach(x=>$('#'+x).hidden=x!==v);$('#topbar').hidden=v==='vWelcome'||v==='vIntro';window.scrollTo(0,0);const hv=$('#heroVid');if(v==='vTitle'&&!matchMedia('(prefers-reduced-motion:reduce)').matches)hv.play().catch(()=>{});else hv.pause()}

/* title strip */
(function(){const st=$('#strip');['inland','whale','zubarah','stars','turtle','mangrove','souq','dhow'].forEach(id=>{const e=EXP[id];const b=document.createElement('button');b.type='button';b.className='thumb';b.innerHTML='<img alt="" loading="lazy"><span class="cap"><small></small></span>';b.querySelector('img').src='media/'+e.img+'.jpg';b.querySelector('small').textContent=e.rare?'Only here':'Classic';b.querySelector('.cap').append(e.t);b.onclick=()=>openD('dRare');st.appendChild(b)})})();

/* setup */
function renderSetup(){
 $('#arr').value=toLocal(S.arr);$('#dep').value=toLocal(S.dep);
 const h=hours();$('#hrs').textContent=h>0?h:0;
 const days=Math.round(h/24*10)/10;$('#hrsTxt').textContent='hours within reach'+(h>=24?' · about '+(Math.round(h/24*2)/2)+' days':'');
 $('#dtErr').textContent=h<10?'Give us at least 10 hours between landing and leaving.':(h>24*14?'Two weeks is the longest window this prototype plans.':'');
 const m=S.arr.getMonth()+1;
 const mo=$('#months');mo.innerHTML='';M.forEach((n,i)=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=n;b.setAttribute('aria-pressed',String(i+1===m));b.onclick=()=>{const len=S.dep-S.arr;const now=qatarNow();let y=now.getFullYear();if(i<now.getMonth())y++;const a=new Date(y,i,Math.min(S.arr.getDate(),28),S.arr.getHours(),S.arr.getMinutes());if(a<now)a.setFullYear(y+1);S.arr=a;S.dep=new Date(a.getTime()+len);renderSetup()};mo.appendChild(b)});
 const se=$('#season'),sn=SEASON[m];se.textContent='';const sb=document.createElement('b');sb.textContent=sn.head;se.append(M[m-1]+' · ',sb,' '+sn.body);
 const p=$('#party');p.innerHTML='';PARTY.forEach(([k,n])=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=n;b.setAttribute('aria-pressed',String(S.party===k));b.onclick=()=>{S.party=k;if(k==='solo'||k==='work'){S.adults=1;S.kids=0}else if(k==='couple'){S.adults=2;S.kids=0}else if(k==='little'||k==='teens'){S.adults=Math.max(2,S.adults);S.kids=Math.max(1,S.kids)}else if(k==='friends')S.adults=Math.max(3,S.adults);renderSetup()};p.appendChild(b)});
 $('#adults').textContent=S.adults;$('#kids').textContent=S.kids;
 const md=$('#moods');md.innerHTML='';MOODS.forEach(([k,n])=>{const b=document.createElement('button');b.type='button';b.className='chip';b.textContent=n;b.setAttribute('aria-pressed',String(S.moods.has(k)));b.onclick=()=>{if(S.moods.has(k))S.moods.delete(k);else S.moods.add(k);renderSetup()};md.appendChild(b)});
 document.querySelectorAll('#quick .chip').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.h===h)));
}
$('#arr').onchange=e=>{const v=new Date(e.target.value);if(!isNaN(v)){const len=S.dep-S.arr;S.arr=v;if(S.dep<=v)S.dep=new Date(v.getTime()+len)}renderSetup()};
$('#dep').onchange=e=>{const v=new Date(e.target.value);if(!isNaN(v))S.dep=v;renderSetup()};
document.querySelectorAll('#quick .chip').forEach(b=>b.onclick=()=>{S.dep=new Date(S.arr.getTime()+(+b.dataset.h)*3600e3);renderSetup()});
document.querySelectorAll('.step button').forEach(b=>b.onclick=()=>{const k=b.dataset.k;S[k]=Math.max(k==='adults'?1:0,Math.min(9,S[k]+(+b.dataset.d)));renderSetup()});
$('#timerOn').onchange=e=>S.timer=e.target.checked;
$('#bStart').onclick=()=>{renderSetup();show('vSetup')};
$('#bRoll').onclick=()=>{const h=hours();if(h<10||h>24*14){$('#rollErr').textContent='Fix your window first.';return}$('#rollErr').textContent='';S.rolled=true;plan();if(!S.scenes.length){renderEnd();return}S.idx=0;S.hist=[];seen.clear();renderScene()};

/* scene */
let tmr=null,typeId=0;
function stopTimer(){clearTimeout(tmr);tmr=null;$('#timer').classList.remove('run')}
function setMedia(id){const e=EXP[id];const sc=$('#screen');sc.querySelectorAll('.media').forEach(x=>x.remove());let el;
 if(e.vid&&!matchMedia('(prefers-reduced-motion:reduce)').matches){el=document.createElement('video');el.muted=true;el.loop=true;el.playsInline=true;el.autoplay=true;el.poster='media/'+e.img+'.jpg';el.src='media/'+e.vid+'.mp4'}
 else{el=document.createElement('img');el.alt='';el.src='media/'+(e.img||'hero')+'.jpg';el.className='kb'}
 el.classList.add('media');sc.prepend(el);if(el.play)el.play().catch(()=>{})}
function narration(sc,i){
 const row=S.rows[sc.ri];const [a,b]=sc.opts;const who={solo:"You're on your own and answerable to no one.",couple:"The two of you, and no fixed plan.",friends:"The group chat is already arguing about what's next.",little:"Two small travellers who slept badly on the plane.",teens:"Teenagers who will judge every choice you make.",work:"Meetings done. The city is yours for a few hours.",event:"You came for one night. Make the rest of it count."}[S.party];
 const first=i===0?'You land at '+pad(S.arr.getHours())+':'+pad(S.arr.getMinutes())+'. '+who+' ':'';
 const any=x=>sc.opts.includes(x);
 if(any('whale'))return first+"Your alarm could go at 04:45. Off the north-east coast, hundreds of the biggest fish in the sea are feeding at the surface. Or you could sleep in.";
 if(sc.opts.some(x=>EXP[x].ev))return first+"Something is happening in the city tonight that won't be here next week. Do you go?";
 if(row.type==='morning')return first+'Day '+dayN(row.when)+', 09:30. The heat has not arrived yet. Where does the morning go?';
 if(row.type==='golden')return first+'15:30. The light starts turning gold. Where do you watch the sun go down?';
 return first+'Night falls fast here. One choice for the evening.';
}
function renderScene(){
 if(S.idx>=S.scenes.length)return renderEnd();
 const sc=S.scenes[S.idx],row=S.rows[sc.ri];
 setMedia(sc.opts[0]);
 $('#hTc').textContent=tc(row,sc.opts[0]);$('#hCount').textContent='SCENE '+(S.idx+1)+' / '+S.scenes.length;$('#hKick').textContent=SLOTNAME[row.type].toUpperCase();
 typeLine($('#narr'),narration(sc,S.idx));
 const box=$('#choices');box.innerHTML='';
 sc.opts.forEach(id=>{const e=EXP[id];const b=document.createElement('button');b.type='button';b.className='choice';
  b.innerHTML='<div class="ph"><img alt=""><span class="tag"></span></div><div class="bd"><h3></h3><span class="s"></span><span class="m"></span></div>';
  b.querySelector('img').src='media/'+(e.img||'hero')+'.jpg';const tg=b.querySelector('.tag');tg.textContent=e.ev?'Happening now':e.rare?'Only here':e.free?'Breathe':'Classic';tg.className='tag'+(e.ev?' ev':e.rare?' rare':'');
  b.querySelector('h3').textContent=e.t;b.querySelector('.s').textContent=e.s;b.querySelector('.m').textContent=e.dur+' · '+(e.price?fmtQ(e.price)+' pp':'Free');
  b.onmouseenter=()=>setMedia(id);b.onfocus=()=>setMedia(id);b.onclick=()=>choose(id);box.appendChild(b)});
 $('#backTxt').textContent=S.idx===0?'Back to setup':'Previous question';$('#restartAsk').hidden=true;$('#bRestart').hidden=S.idx===0;
 const t=$('#timer');t.classList.remove('run');t.classList.toggle('off',!S.timer);
 $('#hint').textContent=S.timer?'Choose before the line runs out':'Take your time';
 clearTimeout(tmr);
 if(S.timer){void t.offsetWidth;t.style.setProperty('--dur','12s');t.classList.add('run');
  tmr=setTimeout(()=>{const def=sc.pick||sc.opts[0];box.children[sc.opts.indexOf(def)].classList.add('hot');$('#hint').textContent='Time ran out. We chose for you.';setTimeout(()=>choose(def),900)},12000)}
 show('vScene');
}
function typeLine(el,txt){const my=++typeId;if(matchMedia('(prefers-reduced-motion:reduce)').matches){el.textContent=txt;return}el.textContent='';let i=0;(function st(){if(my!==typeId)return;el.textContent=txt.slice(0,++i);if(i<txt.length)setTimeout(st,13)})()}
function choose(id){stopTimer();const sc=S.scenes[S.idx];sc.pick=id;S.rows[sc.ri].pick=id;S.hist.push(S.idx);S.idx++;renderScene()}
$('#bBack').onclick=()=>{if(S.idx>0){S.idx--;S.hist=[...Array(S.idx).keys()];renderScene()}else{stopTimer();renderSetup();show('vSetup')}};
$('#bRestart').onclick=()=>{stopTimer();$('#restartAsk').hidden=false;$('#hint').textContent='Paused';$('#bRestartYes').focus()};
$('#bRestartNo').onclick=()=>{$('#restartAsk').hidden=true;renderScene()};
$('#bRestartYes').onclick=()=>{plan();S.idx=0;S.hist=[];renderScene()};
$('#bSkip').onclick=()=>{stopTimer();renderEnd()};

/* itinerary */
const seen=new Set();
const cut=()=>S.scenes.map(s=>s.opts.indexOf(S.rows[s.ri].pick)===1?'B':'A').join('');
const pax=()=>S.adults+S.kids;
const itemCost=id=>{const e=EXP[id];return e.price*S.adults+e.price*.5*S.kids};
const booked=()=>S.rows.filter(r=>r.pick!=='rest');
function renderEnd(){
 S.rolled=true;stopTimer();if(!S.rows.length)plan();
 const b=booked();const rares=b.filter(r=>EXP[r.pick].rare).length,evs=b.filter(r=>EXP[r.pick].ev).length;
 seen.add(cut());
 $('#eKick').textContent='Your cut · '+(S.scenes.length?'CUT '+cut()+' of '+(2**S.scenes.length)+' possible':'');
 $('#eHead').textContent=b.length+' moments in '+hours()+' hours'+(rares?', '+rares+' found only in Qatar':'')+(evs?', '+evs+' live event'+(evs>1?'s':''):'')+'.';
 $('#eLede').textContent='All times are Qatar time (GMT+3). Tap any title to change it. Out-of-season options show when they come back. Free time is always an option.';
 const p=$('#plan');p.innerHTML='';let lastDay=0;
 const fixed=(when,title,meta)=>{const d=document.createElement('div');d.className='item fixed';d.innerHTML='<div class="im">✈</div><div><div class="tm"></div><div style="font-weight:700"></div><div class="mt"></div></div><div class="pr">Included</div>';d.querySelector('.tm').textContent=when;d.children[1].children[1].textContent=title;d.querySelector('.mt').textContent=meta;p.appendChild(d)};
 const dayHead=n=>{const h=document.createElement('div');h.className='day';const dd=new Date(S.arr);dd.setDate(dd.getDate()+n-1);h.textContent='DAY '+n+' · '+dd.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();p.appendChild(h)};
 dayHead(1);lastDay=1;fixed('DAY 1 · '+pad(S.arr.getHours())+':'+pad(S.arr.getMinutes()),'Land at Hamad International','Meet-and-greet and private transfer to your hotel');
 S.rows.forEach((row,ri)=>{
  const n=dayN(row.when);if(n!==lastDay){dayHead(n);lastDay=n}
  const e=EXP[row.pick];const d=document.createElement('div');d.className='item'+(e.rare||e.ev?' rare':'');
  d.innerHTML='<div class="im"></div><div style="min-width:0"><div class="tm"></div><select aria-label="Change this moment"></select><div class="mt"></div></div><div class="pr tab"></div>';
  const im=d.querySelector('.im');if(e.img){im.innerHTML='<img alt="">';im.firstChild.src='media/'+e.img+'.jpg'}else im.textContent='FREE';
  d.querySelector('.tm').textContent=tc(row)+' · '+SLOTNAME[row.type].toUpperCase();
  const sel=d.querySelector('select');
  const groups=[['Happening during your trip',x=>EXP[x].ev],['Only here',x=>EXP[x].rare],['Classics',x=>!EXP[x].rare&&!EXP[x].ev&&!EXP[x].free],['Or',x=>EXP[x].free]];
  groups.forEach(([lab,f])=>{const og=document.createElement('optgroup');og.label=lab;
   Object.keys(EXP).filter(x=>f(x)&&EXP[x].slots.includes(row.type)).forEach(x=>{const r=why(row,x);if(r==='dates'||r==='slot')return;const o=document.createElement('option');o.value=x;
    const elsewhere=x!=='rest'&&S.rows.some((rr,j)=>j!==ri&&rr.pick===x);
    o.textContent=EXP[x].t+(r==='season'?' · out of season':r==='time'?' · too early for your flight':r==='party'?' · not for this trip':r==='ramadan'?' · after sunset in Ramadan':elsewhere?' · already in your trip':(EXP[x].price?' · '+fmtQ(EXP[x].price)+' pp':''));
    o.disabled=!!r||elsewhere;o.selected=x===row.pick;og.appendChild(o)});
   if(og.children.length)sel.appendChild(og)});
  sel.onchange=()=>{row.pick=sel.value;const s=S.scenes.find(s=>s.ri===ri);if(s)s.pick=sel.value;renderEnd()};
  d.querySelector('.mt').textContent=e.free?e.s:e.dur+' · '+e.op;
  d.querySelector('.pr').textContent=e.price?fmtQ(itemCost(row.pick)):'—';
  p.appendChild(d)});
 const tr=new Date(S.dep.getTime()-3*3600e3),tn=dayN(tr);if(tn!==lastDay)dayHead(tn);
 fixed('DAY '+tn+' · '+pad(tr.getHours())+':'+pad(tr.getMinutes()),'Transfer to the airport','Bags collected from your hotel; your flight leaves at '+pad(S.dep.getHours())+':'+pad(S.dep.getMinutes()));
 const sub=b.reduce((n,r)=>n+itemCost(r.pick),0);
 const sm=$('#sum');sm.innerHTML='<span class="kicker">One basket</span>';
 const line=(a,v)=>{const l=document.createElement('div');l.className='line';l.innerHTML='<span></span><span class="tab"></span>';l.children[0].textContent=a;l.children[1].textContent=v;sm.appendChild(l)};
 line('Travellers',S.adults+' adult'+(S.adults>1?'s':'')+(S.kids?', '+S.kids+' child'+(S.kids>1?'ren':''):''));
 line('Experiences',String(b.length));line('Only-here moments',String(rares));line('Airport transfers','Included');
 if(S.kids)line('Children','Half price');
 const t=document.createElement('div');t.className='tot tab';t.innerHTML='<span>Total</span><span></span>';t.children[1].textContent=fmtQ(sub);sm.appendChild(t);
 const fin=document.createElement('button');fin.className='btn';fin.type='button';fin.textContent='Finalize my itinerary';fin.disabled=!b.length;fin.onclick=openPdf;sm.appendChild(fin);
 const bk=document.createElement('button');bk.className='btn alt2';bk.type='button';bk.textContent=b.length?'Book now':'Add something to book';bk.disabled=!b.length;bk.onclick=()=>{if(b.length)renderPay()};sm.appendChild(bk);
 const row2=document.createElement('div');row2.className='row';
 const again=document.createElement('button');again.className='linkbtn';again.type='button';again.textContent='Replay the film';again.onclick=()=>{if(S.scenes.length){S.idx=0;S.hist=[];renderScene()}};
 const talk=document.createElement('button');talk.className='linkbtn';talk.type='button';talk.textContent='Talk to Khalid';talk.onclick=()=>openD('dNarr');
 const setb=document.createElement('button');setb.className='linkbtn';setb.type='button';setb.textContent='Change dates or travellers';setb.onclick=()=>{renderSetup();show('vSetup')};
 const prev=document.createElement('button');prev.className='linkbtn';prev.type='button';prev.textContent='Preview Khalid\'s check-ins';prev.onclick=previewCheckins;
 row2.append(again,talk,prev,setb);sm.appendChild(row2);
 const f=document.createElement('p');f.className='fine';f.textContent='Prices are illustrative, per person, in Qatari riyals. Wildlife trips run with conservation-approved operators.';sm.appendChild(f);
 show('vEnd');
}

/* checkout */
function renderPay(){
 const b=booked();const o=$('#osum');o.innerHTML='<span class="kicker">Your order</span>';
 b.forEach(r=>{const e=EXP[r.pick];const t=document.createElement('div');t.className='ticket';
  t.innerHTML='<img alt=""><div class="tb2"><span class="tt"></span><span class="tn"></span><span class="tm2"><span></span><b class="tab"></b></span></div>';
  t.querySelector('img').src='media/'+e.img+'.jpg';t.querySelector('.tt').textContent=tc(r)+(e.rare?' · ONLY HERE':e.ev?' · EVENT':'');t.querySelector('.tn').textContent=e.t;
  t.querySelector('.tm2 span').textContent=pax()+' traveller'+(pax()>1?'s':'')+' · '+e.dur;t.querySelector('.tm2 b').textContent=e.price?fmtQ(itemCost(r.pick)):'Free';o.appendChild(t)});
 const sub=b.reduce((n,r)=>n+itemCost(r.pick),0);
 const ln=(a,v)=>{const l=document.createElement('div');l.className='line';l.innerHTML='<span></span><span class="tab"></span>';l.children[0].textContent=a;l.children[1].textContent=v;o.appendChild(l)};
 ln('Experiences ('+b.length+')',fmtQ(sub));ln('Airport transfers','Included');ln('Taxes','Included');
 const tt=document.createElement('div');tt.className='tot tab';tt.innerHTML='<span>Total</span><span></span>';tt.children[1].textContent=fmtQ(sub);o.appendChild(tt);
 const e=document.createElement('div');e.className='perr';e.id='perr';e.setAttribute('role','status');o.appendChild(e);
 const pb=document.createElement('button');pb.className='paybtn';pb.type='button';pb.textContent='Pay '+fmtQ(sub);pb.onclick=()=>pay(pb,sub);o.appendChild(pb);
 show('vPay');
}
document.querySelectorAll('.method').forEach(m=>m.onclick=()=>{document.querySelectorAll('.method').forEach(x=>x.setAttribute('aria-pressed',String(x===m)));$('#cardF').hidden=m.textContent!=='Card'});
$('#bEdit').onclick=()=>renderEnd();
['#pName','#pMail'].forEach(s=>$(s).addEventListener('input',()=>{const e=$('#perr');if(e)e.textContent=''}));
function pay(btn,sub){
 const n=$('#pName').value.trim(),m=$('#pMail').value.trim();
 if(!n){$('#perr').textContent='Add the lead traveller\'s name.';$('#pName').focus();return}
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){$('#perr').textContent='Add an email address for the tickets.';$('#pMail').focus();return}
 btn.disabled=true;btn.textContent='Confirming…';
 setTimeout(()=>{
  const ref='WR-'+cut()+'-'+(1000+Math.floor(Math.random()*9000));const b=booked();
  const w=$('#payWrap');w.innerHTML='';const sh=document.createElement('div');sh.className='sheet done';sh.style.gridColumn='1/-1';
  sh.innerHTML='<span class="kicker">Confirmed</span><h2></h2><span class="ref"></span><p class="fine"></p><div class="rl" style="gap:10px"></div><div class="row"><button class="paybtn" type="button" style="width:auto;padding:14px 22px">Plan another trip</button></div>';
  sh.querySelector('h2').textContent='You\'re booked, '+n.split(' ')[0]+'.';sh.querySelector('.ref').textContent=ref;
  sh.querySelector('.fine').textContent='Prototype only: nothing was booked and nothing was charged. In the live product, tickets for '+b.length+' experiences ('+fmtQ(sub)+') would go to '+m+' and into the Visit Qatar app.';
  const l=sh.querySelector('.rl');b.forEach(r=>{const e=EXP[r.pick];const t=document.createElement('div');t.className='ticket';t.innerHTML='<img alt=""><div class="tb2"><span class="tt"></span><span class="tn"></span><span class="tm2"><span></span><b>Ticket ready</b></span></div>';t.querySelector('img').src='media/'+e.img+'.jpg';t.querySelector('.tt').textContent=tc(r);t.querySelector('.tn').textContent=e.t;t.querySelector('.tm2 span').textContent=e.op;l.appendChild(t)});
  sh.querySelector('.paybtn').onclick=()=>location.reload();
  w.appendChild(sh);window.scrollTo(0,0);
 },1200);
}

/* finalize: email the itinerary as a PDF (or download it where email isn't available) */
const pad2=n=>String(n).padStart(2,'0'),hm2=d=>pad2(d.getHours())+':'+pad2(d.getMinutes());
const longDate=d=>d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
function buildPdf(){
 const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:'pt',format:'a4'});const PW=595,M=44;let y;
 const ink=[19,48,58],dim=[74,94,101],teal=[0,88,111],maroon=[142,21,55],orange=[191,79,0];
 const color=c=>doc.setTextColor(c[0],c[1],c[2]);
 const room=h=>{if(y+h>792){doc.addPage();y=56}};
 doc.setFillColor(0,88,111);doc.rect(0,0,PW,124,'F');
 doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(107,218,213);doc.text('YOUR TRIP, YOUR WAY.  \u00B7  QATAR',M,36);
 doc.setTextColor(255,255,255);doc.setFontSize(24);doc.text((S.name?S.name.split(' ')[0]+"'s":'Your')+' Qatar itinerary',M,70);
 doc.setFont('helvetica','normal');doc.setFontSize(10.5);
 doc.text(longDate(S.arr)+', '+hm2(S.arr)+'  to  '+longDate(S.dep)+', '+hm2(S.dep)+'   \u00B7   Qatar time (GMT+3)',M,92);
 doc.text(S.adults+' adult'+(S.adults>1?'s':'')+(S.kids?', '+S.kids+' child'+(S.kids>1?'ren':''):'')+'   \u00B7   '+((PARTY.find(p=>p[0]===S.party)||[,''])[1]),M,108);
 y=156;let day=0;
 const dayHead=n=>{room(40);const d=new Date(S.arr);d.setDate(d.getDate()+n-1);doc.setFont('helvetica','bold');doc.setFontSize(11);color(teal);doc.text(('Day '+n+'  \u00B7  '+d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})).toUpperCase(),M,y);doc.setDrawColor(214,209,196);doc.line(M,y+6,PW-M,y+6);y+=24};
 const item=(time,title,meta,price,accent)=>{room(40);doc.setFont('helvetica','bold');doc.setFontSize(10.5);color(accent||ink);doc.text(time,M,y);color(ink);doc.text(doc.splitTextToSize(title,330)[0],M+56,y);doc.setFont('helvetica','normal');doc.text(price,PW-M,y,{align:'right'});doc.setFontSize(9);color(dim);doc.text(doc.splitTextToSize(meta,400)[0],M+56,y+13);y+=32};
 const arrDay=1;dayHead(arrDay);day=arrDay;item(hm2(S.arr),'Land at Hamad International','Meet-and-greet and private transfer to your hotel','Included');
 S.rows.forEach(r=>{const n=dayN(r.when);if(n!==day){dayHead(n);day=n}const e=EXP[r.pick],t=slotStart(r,r.pick);
  item(hm2(t),e.t+(e.rare?'  \u00B7  Only here':e.ev?'  \u00B7  Event':''),e.free?e.s:SLOTNAME[r.type]+'  \u00B7  '+e.dur+'  \u00B7  '+e.op,e.price?fmtQ(itemCost(r.pick)):'\u2014',e.rare||e.ev?orange:null)});
 const tr=new Date(S.dep.getTime()-3*3600e3);if(dayN(tr)!==day)dayHead(dayN(tr));item(hm2(tr),'Transfer to the airport','Your flight leaves at '+hm2(S.dep),'Included');
 const sub=booked().reduce((n,r)=>n+itemCost(r.pick),0);room(70);y+=6;doc.setDrawColor(0,88,111);doc.setLineWidth(1.2);doc.line(M,y,PW-M,y);y+=24;
 doc.setFont('helvetica','bold');doc.setFontSize(14);color(maroon);doc.text('Total',M,y);doc.text(fmtQ(sub),PW-M,y,{align:'right'});y+=18;
 doc.setFont('helvetica','normal');doc.setFontSize(8.5);color(dim);
 doc.splitTextToSize('Prices are illustrative, per person, in Qatari riyals; children are half price. Wildlife trips run with conservation-approved operators and may move a day with sea conditions. Concept prototype: nothing is booked until you complete checkout.',PW-2*M).forEach(l=>{room(12);doc.text(l,M,y);y+=11});
 return doc.output('blob');
}
const pdfName=()=>'Qatar itinerary'+(S.name?' - '+S.name.split(' ')[0]:'')+'.pdf';
async function savePdf(blob){
 if(window.claude&&window.claude.use){const dl=await window.claude.use('downloads');if(!dl)throw{code:'unavailable'};return dl.save({filename:pdfName(),data:blob})}
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=pdfName();document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
}
const b64=blob=>new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(String(f.result).split(',')[1]);f.onerror=rej;f.readAsDataURL(blob)});
function openPdf(){$('#fMail').value=$('#fMail').value||$('#pMail').value;$('#fErr').textContent='';$('#fDone').hidden=true;$('#pdfForm').hidden=false;$('#fDownload').hidden=false;openD('dPdf');setTimeout(()=>$('#fMail').focus(),50)}
function pdfDone(msg){$('#fDoneTxt').textContent=msg;$('#fDone').hidden=false;$('#pdfForm').hidden=true;$('#fDownload').hidden=true}
$('#fMail').addEventListener('input',()=>$('#fErr').textContent='');
$('#pdfForm').onsubmit=async e=>{e.preventDefault();const m=$('#fMail').value.trim(),btn=$('#fSend');
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)){$('#fErr').textContent='Add a valid email address, for example mariam@example.com.';$('#fMail').focus();return}
 if(!$('#pMail').value)$('#pMail').value=m;btn.disabled=true;btn.textContent='Preparing your PDF\u2026';
 let blob;try{blob=buildPdf()}catch(err){console.error(err);$('#fErr').textContent='The PDF could not be made. Try again in a moment.';btn.disabled=false;btn.textContent='Email me the PDF';return}
 let sent=false;
 if(!window.claude){try{const r=await fetch('api/send-itinerary',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:m,name:S.name,filename:pdfName(),pdf:await b64(blob)})});sent=r.ok}catch(err){sent=false}}
 btn.disabled=false;btn.textContent='Email me the PDF';
 if(sent){pdfDone('Sent to '+m+'. Check your inbox, and your spam folder if it isn\'t there in a few minutes.');return}
 try{await savePdf(blob);pdfDone('Email isn\'t switched on in this preview yet, so your PDF has been downloaded instead. When the site goes live, it will arrive at '+m+'.')}
 catch(err){$('#fErr').textContent=err&&err.code==='declined'?'Download cancelled. Tap the button to try again.':'Email isn\'t available here yet and the download was blocked. Try another browser.'}};
$('#fDownload').onclick=async()=>{try{await savePdf(buildPdf());$('#fErr').textContent='';pdfDone('Your PDF has been downloaded.')}catch(err){$('#fErr').textContent=err&&err.code==='declined'?'Download cancelled.':'The download was blocked here. Try another browser.'}};
$('#fBook').onclick=()=>{$('#dPdf').hidden=true;renderPay()};

/* drawers */
let paused=false;
function openD(id){if(id==='dNarr')$('#bNarr').classList.remove('dot');if(!$('#vScene').hidden&&tmr){stopTimer();paused=true}if(id==='dMap')renderMap();if(id==='dRare')renderRare();$('#'+id).hidden=false;if(id==='dNarr')setTimeout(()=>$('#ask').focus(),50)}
function closeD(el){el.hidden=true;if(paused&&!$('#vScene').hidden){paused=false;renderScene()}}
document.querySelectorAll('.drawer').forEach(d=>d.addEventListener('click',e=>{if(e.target===d||e.target.hasAttribute('data-close'))closeD(d)}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.drawer').forEach(d=>{if(!d.hidden)closeD(d)})});
function goHome(){if(!document.getElementById('osum')){location.reload();return}stopTimer();paused=false;typeId++;document.querySelectorAll('.drawer').forEach(d=>d.hidden=true);show('vTitle')}
$('#bHome').onclick=goHome;document.querySelectorAll('[data-home]').forEach(b=>b.onclick=goHome);$('#bLogo').onclick=goHome;
$('#bRare').onclick=()=>openD('dRare');$('#bMap').onclick=()=>openD('dMap');$('#bNarr').onclick=()=>openD('dNarr');$('#bBrowse').onclick=()=>openD('dRare');

let rareTab='exp';
$('#tExp').onclick=()=>{rareTab='exp';renderRare()};$('#tEv').onclick=()=>{rareTab='ev';renderRare()};
function placeInTrip(id){
 if(!S.rows.length)plan();
 const ri=S.rows.findIndex(r=>ok(r,id)&&r.pick!==id&&!EXP[r.pick].ev);
 if(ri<0)return false;S.rows.forEach(r=>{if(r.pick===id)r.pick='rest'});S.rows[ri].pick=id;const s=S.scenes.find(s=>s.ri===ri);if(s){s.pick=id;if(!s.opts.includes(id))s.opts[1]=id}return true;
}
function renderRare(){
 $('#tExp').setAttribute('aria-pressed',String(rareTab==='exp'));$('#tEv').setAttribute('aria-pressed',String(rareTab==='ev'));
 const body=$('#rareBody');body.innerHTML='';const m=S.arr.getMonth()+1;
 const inTrip=id=>S.rows.some(r=>r.pick===id);
 if(rareTab==='exp'){
  $('#rareLede').textContent='Moments found nowhere else in the Gulf. Seasons shown for a trip in '+M[m-1]+'.';
  ['inland','whale','zubarah','stars','turtle','mangrove'].forEach(id=>{const e=EXP[id];const inS=e.months.includes(m);
   const c=card(e,null);const st=c.querySelector('.status');
   const nxt=e.months.find(x=>x>m)||e.months[0];
   st.textContent=e.months.length===12?(e.best&&!e.best.includes(m)?'Open · best Oct to Apr':'Open all year'):inS?'In season · '+M[e.months[0]-1]+' to '+M[e.months[e.months.length-1]-1]:'Back in '+M[nxt-1];
   st.className='status '+(inS?'now':'off');
   const a=c.querySelector('.add');
   if(inTrip(id)){a.textContent='In your trip';a.disabled=true}
   else if(!inS){a.textContent='Remind me';a.onclick=()=>{a.textContent='We\'ll remind you';a.disabled=true}}
   else{a.textContent='Add to my trip';a.onclick=()=>{if(placeInTrip(id)){$('#dRare').hidden=true;paused=false;renderEnd()}else{a.textContent='No free slot fits';a.disabled=true}}}
   body.appendChild(c)});
 }else{
  $('#rareLede').textContent='What\'s on from October 2026 to March 2027. Events marked "sample" use placeholder copy for the prototype.';
  EVENTS.forEach(ev=>{const e=EXP[ev.id];const c=card(e,ev);const st=c.querySelector('.status');
   const f=new Date(ev.from+'T00:00'),t=new Date(ev.to+'T00:00');
   st.textContent=f.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+(ev.from!==ev.to?' to '+t.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'');
   const during=S.rows.some(r=>ok(r,ev.id));st.className='status '+(during?'now':'soon');
   const a=c.querySelector('.add');
   if(inTrip(ev.id)){a.textContent='In your trip';a.disabled=true}
   else if(during){a.textContent='During your trip · add it';a.onclick=()=>{if(placeInTrip(ev.id)){$('#dRare').hidden=true;paused=false;renderEnd()}}}
   else{a.textContent='Plan my trip around it';a.onclick=()=>{const len=Math.max(S.dep-S.arr,48*3600e3);const a2=new Date(f);a2.setHours(6,40);S.arr=a2;S.dep=new Date(a2.getTime()+len);plan();placeInTrip(ev.id);$('#dRare').hidden=true;paused=false;renderEnd()}}
   body.appendChild(c)});
 }
}
function card(e,ev){
 const c=document.createElement('div');c.className='rcard';
 c.innerHTML='<div class="ri"><img alt="" loading="lazy"></div><div class="rb"><span class="status"></span><h3></h3><p></p><button class="add" type="button"></button></div>';
 c.querySelector('img').src='media/'+e.img+'.jpg';c.querySelector('h3').textContent=e.t;c.querySelector('p').textContent=e.s;
 if(ev){const f=new Date(ev.from+'T00:00');const d=document.createElement('div');d.className='date';d.innerHTML='<small></small>';d.firstChild.textContent=M[f.getMonth()].toUpperCase();d.append(String(f.getDate()));c.querySelector('.ri').appendChild(d);
  if(!ev.real){const s=document.createElement('span');s.className='sample';s.textContent='SAMPLE';c.querySelector('.rb').insertBefore(s,c.querySelector('h3'))}}
 return c;
}
function renderMap(){
 const m=$('#mapBody');m.innerHTML='';
 if(!S.scenes.length){m.innerHTML='<p class="fine">Roll the film first to see your recent choices.</p>';$('#mapCount').textContent='';return}
 S.scenes.forEach((sc,i)=>{
  if(i)m.insertAdjacentHTML('beforeend','<div class="join"></div>');
  const row=document.createElement('div');row.className='lvl';row.innerHTML='<span class="k"></span>';row.firstChild.textContent=tc(S.rows[sc.ri],sc.opts[0]).replace('DAY ','D');
  sc.opts.forEach(id=>{const e=EXP[id];const b=document.createElement('button');b.type='button';b.className='node'+(S.rows[sc.ri].pick===id?' on':'')+(e.rare||e.ev?' rare':'');b.textContent=e.t;
   b.onclick=()=>{S.rows[sc.ri].pick=id;sc.pick=id;S.idx=i;S.hist=[...Array(i).keys()];$('#dMap').hidden=true;paused=false;renderScene()};row.appendChild(b)});
  m.appendChild(row)});
 const missed=S.scenes.reduce((n,sc)=>n+sc.opts.filter(id=>(EXP[id].rare||EXP[id].ev)&&S.rows[sc.ri].pick!==id).length,0);
 $('#mapCount').textContent=(2**S.scenes.length)+' possible cuts in this window. You have watched '+Math.max(seen.size,1)+'. '+(missed?missed+' only-here moment'+(missed>1?'s':'')+' left on the table.':'');
}

/* Khalid: the traveller's AI friend. Order of preference:
   1. claude.ai artifact runtime (window.claude "sample"),
   2. this site's own /api/khalid endpoint (server-side Claude API call, key never in the page),
   3. offline(), a keyword-based recut so the demo always answers. */
const turns=[];
function say(cls,txt){const d=document.createElement('div');d.className='msg '+cls;d.textContent=txt;$('#log').appendChild(d);d.scrollIntoView({block:'end'});return d}
say('nr',"Marhaba, I'm Khalid, your AI friend for this trip. Tell me who's coming and what you love, and I'll rework the plan with you.");
function stateText(){if(!S.rolled)return JSON.stringify({questionnaireDone:false,travellers:{firstName:S.name.split(' ')[0]||undefined}});if(!S.rows.length)plan();const mo=S.arr.getMonth()+1;return JSON.stringify({questionnaireDone:true,window:{land:toLocal(S.arr),leave:toLocal(S.dep)},trip:{ramadanExpected:S.rows.some(r=>inRamadan(r.when))||inRamadan(S.arr)||inRamadan(S.dep),month:S.arr.toLocaleDateString('en-GB',{month:'long'}),season:SEASON[mo].head+' '+SEASON[mo].body,climate:CLIMATE[mo]},travellers:{firstName:S.name.split(' ')[0]||undefined,type:(PARTY.find(p=>p[0]===S.party)||[,S.party])[1],adults:S.adults,children:S.kids,hasChildren:hasKids()},moods:[...S.moods],rows:S.rows.map((r,i)=>({row:i,when:tc(r),slot:r.type,current:r.pick,options:Object.keys(EXP).filter(x=>ok(r,x)).map(x=>({id:x,title:EXP[x].t,about:EXP[x].s,duration:EXP[x].dur,includes:EXP[x].op,onlyHere:!!EXP[x].rare,event:!!EXP[x].ev,price:EXP[x].price,moods:EXP[x].moods}))}))})}
let lastOffer='';
/* Offline suggestion that respects the questionnaire: season, climate, who's travelling, moods, free slots. */
function suggest(q){
 const mo=S.arr.getMonth()+1,ML=S.arr.toLocaleDateString('en-GB',{month:'long'}),veryHot=mo>=6&&mo<=9,hot=veryHot||mo===5||mo===10;
 let lead='';
 if(/beach|swim/.test(q))lead=veryHot?"In "+ML+" it's over 40°C by day, so I'd skip the beach this trip. ":hot?"The beach is only comfortable early or late in "+ML+". ":"";
 if(/camp|stars/.test(q)){const e=EXP.stars,ri=S.rows.findIndex(r=>r.pick==='stars');
  if(ri>=0)return {reply:"You're already sleeping under the stars on "+tc(S.rows[ri],'stars').replace('DAY','Day').replace(' · ',' at ')+". It's going to be special.",changes:[]};
  if(S.party==='little')return {reply:"With little ones I'd skip the overnight camp. Souq Waqif in the early evening is a lovely alternative. Want me to suggest a time?",changes:[]};
  const r=S.rows.map((r,i)=>[r,i]).find(([r])=>ok(r,'stars')&&r.pick==='rest')||S.rows.map((r,i)=>[r,i]).find(([r])=>ok(r,'stars'));
  if(!r){const w=why(S.rows.find(x=>x.type==='evening')||S.rows[0],'stars');return {reply:w==='season'?"The desert camp runs November to March, so it isn't on for "+ML+". "+"Want a different evening idea?":w==='party'?"The desert camp isn't offered on work trips, but Souq Waqif after dark is a great evening instead.":"There's no free evening for the desert camp in your window.",changes:[]}}
  lastOffer={row:r[1],id:'stars'};
  return {reply:"Yes, the desert camp by the Inland Sea works"+(S.party==='teens'?" for families with teens":"")+" in "+ML+". It's overnight with dinner and breakfast, "+fmtQ(e.price)+" per adult"+(S.kids?" and half price for children":"")+". Want me to add it to "+tc(r[0],'stars').replace('DAY','Day').replace(' · ',' at ')+"?",changes:[]}}
 const used=new Set(S.rows.map(r=>r.pick));
 const free=S.rows.map((r,i)=>[r,i]).filter(([r])=>r.pick==='rest');
 const pool=(free.length?free:S.rows.map((r,i)=>[r,i]));
 let best=null;
 pool.forEach(([r,i])=>Object.keys(EXP).forEach(id=>{const e=EXP[id];if(e.free||used.has(id)||!ok(r,id))return;
  if(hasKids()&&(id==='stars'||id==='race')&&!(S.party==='teens'&&/camp|desert|star|race/.test(q)))return;
  if(veryHot&&r.type==='golden'&&!['mia','nmoq','spa'].includes(id))return;
  const s=score(id,r);if(!best||s>best.s)best={s,id,i}}));
 if(!best)return {reply:lead+"Your days are nicely full already. Want me to swap something out instead?",changes:[]};
 const e=EXP[best.id],r=S.rows[best.i];lastOffer={row:best.i,id:best.id};
 const reason=hasKids()?" It works well with children.":veryHot&&r.type!=='evening'?" It keeps you out of the midday heat.":"";
 return {reply:lead+"How about "+e.t+" on "+tc(r,best.id).replace('DAY','Day').replace(' · ',' at ')+"? It's "+e.dur+(e.price?" at "+fmtQ(e.price)+" per person":"")+"."+reason+" Want me to add it?",changes:[]};
}
const ITIN=/itinerar|\bmy (plan|trip|schedule|days|bookings?)\b|show (me )?(the |my )?(plan|trip)|see (the |my )?(plan|trip)/i;
const NUDGE="Let's get your trip started first. Fill in the short questionnaire (your dates, who's coming and how you want it to feel), then roll the film to get your itinerary. Once it's ready, I'll help you change anything you like.";
function offline(q){
 if(!S.rolled)return {reply:NUDGE,changes:[]};
 q=q.toLowerCase();const offer=lastOffer;lastOffer='';
 const yes=/^(yes|yeah|yep|sure|ok|okay|please|yalla|go on|add it|yes please)\b/.test(q.trim());
 if(/\bvisas?\b|entry rules|passport|alcohol|\bbeer\b|\bwine\b|\blaws?\b|legal|dress code|what (to|should (i|we)) wear|\bsafe(ty)?\b|health|doctor|hospital|emergenc|\btaxi|metro|uber|transport|opening hours/.test(q))return {reply:"That's one to check on the official Visit Qatar website or with your hotel, as I don't want to guess. Shall we carry on with your days?",changes:[]};
 if(ITIN.test(q))return {reply:"Here's your itinerary. Tap any moment there to change it, or tell me what you'd like to swap.",changes:[]};
 if(offer&&typeof offer==='object'&&yes)return {reply:"Done. "+EXP[offer.id].t+" is in your plan for "+tc(S.rows[offer.row],offer.id).replace('DAY','Day').replace(' · ',' at ')+".",changes:[{row:offer.row,pick:offer.id}]};
 if(/suggest|recommend|what should|ideas?|where should|what (can|to) do|anything (else|to do)|beach|swim|bored|camp|stars/.test(q))return suggest(q);const moods=new Set(S.moods);const ban=new Set();let restFirst=false;
 const has=r=>r.test(q);
 if(has(/seasick|boat|sea ?sick/)){ban.add('whale');ban.add('dhow')}
 if(has(/kid|child|family|son|daughter|toddler/)){ban.add('stars');if(!S.kids){S.kids=2}}
 if(has(/histor|culture|heritage|story|museum/))moods.add('culture');
 if(has(/wild|adventure|thrill|nature|rare/)){moods.add('wild');moods.add('adventure')}
 if(has(/relax|rejuven|spa|slow|easy|calm|tired|rest/)){moods.add('rejuvenate');restFirst=has(/tired|first|day one|arriv/)}
 if(has(/food|eat|hungry|cuisine/)||offer==='food'&&has(/^(yes|yeah|sure|ok|okay|please|yalla|yes please)\b/))moods.add('food');
 if(has(/romant|honeymoon|anniversary/))moods.add('romance');
 if(has(/lov|enjoy|amazing|great|best|delicious/)&&!has(/change|swap|instead|more|less|tomorrow|kid|child|seasick/)){const food=has(/restaurant|food|dinner|lunch|breakfast|chicken|ate|eat|meal|cafe|coffee/);lastOffer=food?'food':'similar';
  return {reply:food?"Sounds like you found a gem! Qatar's got some brilliant food spots. Do you want me to give you another suggestion for food tomorrow similar to what you had today?":"Love that! Do you want me to find you something similar for tomorrow?",changes:[]}}
 if(!ban.size&&!restFirst&&[...moods].every(m=>S.moods.has(m))&&moods.size===S.moods.size)return {reply:"Tell me who's with you, what you love or what you'd rather skip, and I'll rework the plan.",changes:[]};
 const changes=[];const used=new Set();
 S.rows.forEach((r,i)=>{let best=r.pick;if(restFirst&&i===0)best='rest';else{const c=Object.keys(EXP).filter(x=>!EXP[x].free&&ok(r,x)&&!ban.has(x)&&!used.has(x)).sort((a,b)=>score(b,r,moods)-score(a,r,moods));if(ban.has(r.pick)||(c[0]&&score(c[0],r,moods)>score(r.pick,r,moods)+1))best=c[0]||'rest'}if(best!=='rest')used.add(best);if(best!==r.pick)changes.push({row:i,pick:best})});
 return {reply:changes.length?"Done. I've moved things around based on what you told me. Have a look at the new plan and tell me if anything feels off.":"Tell me who's with you, what you love or what you'd rather skip, and I'll rework the plan.",changes};
}
/* Validate a batch of changes together, so swaps between two rows work and no experience is booked twice. */
function apply(changes){
 const before=S.rows.map(r=>r.pick),next=[...before];
 (Array.isArray(changes)?changes:[]).forEach(c=>{const i=Number(c&&c.row),id=String(c&&c.pick);if(Number.isInteger(i)&&S.rows[i]&&EXP[id]&&ok(S.rows[i],id))next[i]=id});
 for(let pass=0;pass<next.length;pass++){const cnt={};next.forEach(id=>{if(id!=='rest')cnt[id]=(cnt[id]||0)+1});
  const bad=next.findIndex((id,i)=>id!==before[i]&&cnt[id]>1);if(bad<0)break;next[bad]=before[bad]}
 let n=0;next.forEach((id,i)=>{if(id!==before[i]){S.rows[i].pick=id;const s=S.scenes.find(s=>s.ri===i);if(s)s.pick=id;n++}});return n;
}
const samplePromise=(window.claude&&window.claude.use)?window.claude.use('sample'):Promise.resolve(null);
let liveSample=true,liveApi=!window.claude,busy=null;
function history(q){turns.push({role:'user',content:'Current trip state: '+stateText()+'\n\nTraveller says: '+q});const recent=turns.slice(-6);if(recent[0].role!=='user')recent.shift();return recent}
async function viaSample(q,signal){
 const sample=liveSample?await samplePromise:null;if(!sample)return null;
 try{const out=await sample.json([{role:'user',content:KHALID.rules},...history(q)],{modelTier:'quick',cache:false,signal});if(!out||typeof out.reply!=='string')throw{code:'invalid_json'};return out}
 catch(e){turns.pop();if(e&&e.code==='cancelled')throw e;if(e&&['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed'].includes(e.code))liveSample=false;return null}
}
async function viaApi(q,signal){
 if(!liveApi)return null;const msgs=history(q);
 try{const r=await fetch('api/khalid',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:msgs}),signal});
  if(r.status===404||r.status===405||r.status===501){liveApi=false;throw 0}
  if(!r.ok)throw 0;const out=await r.json();if(!out||typeof out.reply!=='string')throw 0;return out}
 catch(e){turns.pop();if(e&&e.name==='AbortError')throw{code:'cancelled'};return null}
}
async function ask(q){
 if(!q.trim()){$('#narrNote').textContent='Type something for Khalid first.';return}
 if(S.rolled&&!S.rows.length)plan();
 $('#narrNote').textContent='';say('me',q);$('#ask').value='';
 const bubble=say('nr','Khalid is typing…');busy=new AbortController();$('#sendBtn').textContent='STOP';
 let out=null;
 try{out=await viaSample(q,busy.signal)||await viaApi(q,busy.signal)}
 catch(e){bubble.textContent='(Stopped.)';busy=null;$('#sendBtn').textContent='SEND';return}
 if(out)turns.push({role:'assistant',content:JSON.stringify(out)});
 else{out=offline(q);$('#narrNote').textContent='Khalid is in offline demo mode, so this answer comes from simple keyword rules.'}
 busy=null;$('#sendBtn').textContent='SEND';bubble.textContent=out.reply;
 if(!S.rolled){linkQuestionnaire(bubble);return}
 if(ITIN.test(q)||/your itinerary/i.test(out.reply))linkItinerary(bubble);
 const n=apply(out.changes);
 if(n){say('sys','◆ '+n+' moment'+(n>1?'s':'')+' changed');if(!$('#vEnd').hidden)renderEnd();else{const b=document.createElement('button');b.className='pill';b.type='button';b.textContent='SEE MY NEW ITINERARY';b.style.alignSelf='flex-start';b.onclick=()=>{$('#dNarr').hidden=true;paused=false;renderEnd()};$('#log').appendChild(b)}}
}
/* Turns "your itinerary" in Khalid's message into a link to the itinerary page; adds one if he didn't say it. */
function linkItinerary(el){const txt=el.textContent,m=/your itinerary/i.exec(txt);
 const a=document.createElement('a');a.href='#';a.className='qlink';
 a.onclick=e=>{e.preventDefault();$('#dNarr').hidden=true;paused=false;renderEnd()};
 el.textContent='';
 if(m){a.textContent=m[0];el.append(txt.slice(0,m.index),a,txt.slice(m.index+m[0].length))}
 else{a.textContent='Open your itinerary ▸';el.append(txt+' ',a)}}
/* Turns "the short questionnaire\" (or "questionnaire") in Khalid's message into a link to the start of the film; adds one if he didn't say it. */
function linkQuestionnaire(el){const txt=el.textContent,m=/(the )?(short )?(trip )?questionnaire/i.exec(txt);
 const a=document.createElement('a');a.href='#';a.className='qlink';
 a.onclick=e=>{e.preventDefault();$('#dNarr').hidden=true;paused=false;renderSetup();show('vSetup')};
 el.textContent='';
 if(m){a.textContent=m[0];el.append(txt.slice(0,m.index),a,txt.slice(m.index+m[0].length))}
 else{a.textContent='Begin your film ▸';el.append(txt+' ',a)}}
$('#compose').onsubmit=e=>{e.preventDefault();if(busy){busy.abort();return}ask($('#ask').value)};
$('#ask').oninput=()=>$('#narrNote').textContent='';
document.querySelectorAll('#nchips .chip').forEach(c=>c.onclick=()=>{if(!busy)ask(c.textContent)});

/* Check-ins: Khalid messages first at moments in the trip (checkins.js).
   Live: while the page is open during the trip, the latest due check-in is posted and the tab gets a dot.
   Preview: steps through the whole schedule for the demo. */
const fmtWhen=d=>'DAY '+dayN(d)+' · '+pad(d.getHours())+':'+pad(d.getMinutes());
function tripForCheckins(){if(!S.rows.length)plan();return{name:S.name,arr:S.arr,dep:S.dep,rows:booked().map(r=>({start:slotStart(r,r.pick),title:EXP[r.pick].t,short:EXP[r.pick].short||EXP[r.pick].t,slot:r.type}))}}
function sayCheckin(m,label){say('sys','◆ '+label);const d=say('nr',m.text);const box=document.createElement('div');box.className='chips qr';
 m.chips.forEach(t=>{const b=document.createElement('button');b.type='button';b.className='chip sm';b.textContent=t;b.onclick=()=>{if(busy)return;box.remove();ask(t)};box.appendChild(b)});
 d.after(box);box.scrollIntoView({block:'end'});return box}
const delivered=new Set();
function liveCheckins(){const now=qatarNow();if(!S.rows.length||now<S.arr||now>S.dep)return;
 const due=KhalidCheckins.checkins(tripForCheckins()).filter(m=>m.at<=now&&!delivered.has(m.id));if(!due.length)return;
 due.forEach(m=>delivered.add(m.id));sayCheckin(due[due.length-1],'Khalid checked in · '+fmtWhen(due[due.length-1].at));
 if($('#dNarr').hidden)$('#bNarr').classList.add('dot')}
setInterval(liveCheckins,60e3);
function previewCheckins(){const all=KhalidCheckins.checkins(tripForCheckins());let i=0;openD('dNarr');
 say('sys','◆ Preview: how Khalid checks in during this trip ('+all.length+' messages)');
 (function step(){const m=all[i++];const box=sayCheckin(m,'Preview · '+fmtWhen(m.at));
  if(i<all.length){const n=document.createElement('button');n.type='button';n.className='pill';n.textContent='NEXT CHECK-IN ▸';n.style.alignSelf='flex-start';n.onclick=()=>{n.remove();step()};box.after(n);n.scrollIntoView({block:'end'})}
  else say('sys','◆ End of preview. On a real trip Khalid sends these at the times shown.')})()}
/* welcome: Khalid's face is the way in */
document.querySelectorAll('.arch').forEach(a=>{const im=a.querySelector('img'),fail=()=>{a.classList.add('noimg');im.hidden=true};im.addEventListener('error',fail);if(im.complete&&!im.naturalWidth)fail()});
/* WhatsApp: number lives in data/khalid.json ("whatsapp"). Empty = button shows "coming soon" and does nothing. */
function waLinks(){const num=String(KHALID.whatsapp||'').replace(/\D/g,'');
 const text='Marhaba Khalid'+(S.name?", I'm "+S.name.split(' ')[0]:'')+'. Can you help me plan my trip to Qatar?';
 document.querySelectorAll('[data-wa]').forEach(a=>{a.classList.toggle('soon',!num);
  if(num){a.href='https://wa.me/'+num+'?text='+encodeURIComponent(text);a.removeAttribute('aria-disabled')}
  else{a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.title='WhatsApp is coming soon'}})}
waLinks();
function enterHome(){$('#heroRec').textContent=S.name?'● MARHABA, '+S.name.split(' ')[0].toUpperCase():'● AN INTERACTIVE JOURNEY';waLinks();show('vTitle')}
$('#bKhalid').onclick=()=>{if(S.name){enterHome();return}show('vIntro');$('#iName').focus()};
$('#bIntroBack').onclick=()=>show('vWelcome');
['#iName','#iTel'].forEach(s=>$(s).addEventListener('input',()=>$('#iErr').textContent=''));
$('#introForm').onsubmit=e=>{e.preventDefault();
 const name=$('#iName').value.trim().replace(/\s+/g,' '),tel=$('#iTel').value.trim();
 const digits=tel.replace(/[\s\-().]/g,'');
 if(!name){$('#iErr').textContent='Add your name so Khalid knows what to call you.';$('#iName').focus();return}
 if(!/^\+?\d{7,15}$/.test(digits)){$('#iErr').textContent='Add a mobile number with 7 to 15 digits, for example +974 5000 0000.';$('#iTel').focus();return}
 S.name=name;S.tel=digits;
 if(!$('#pName').value)$('#pName').value=name;if(!$('#pTel').value)$('#pTel').value=tel;
 linkQuestionnaire(say('nr','Nice to meet you, '+name.split(' ')[0]+'. Start with the short questionnaire to get your itinerary, and I\'ll be right here to help you adjust it once it\'s ready.'));
 enterHome()};

renderSetup();
show('vWelcome');
if(matchMedia('(prefers-reduced-motion:reduce)').matches)$('#heroVid').removeAttribute('autoplay');
}
