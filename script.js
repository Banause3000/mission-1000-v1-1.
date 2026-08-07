let matches = [];
let rankings = [];
let formData = [];

const $ = id => document.getElementById(id);

function localDateString(d = new Date()){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function normalizeName(value){
  return String(value||"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[’'`´]/g,"").replace(/[-–—]/g," ")
    .replace(/\s+/g," ").trim().toLowerCase();
}
function odd(v){
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2).replace(".",",") : "–";
}
function probs(m){
  const a=Number(m.odds1), b=Number(m.odds2);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<=1||b<=1) return null;
  const x=1/a,y=1/b,t=x+y;
  return {p1:Math.round(x/t*100),p2:Math.round(y/t*100),overround:t};
}
function rank(name,tour){
  const n=normalizeName(name), t=String(tour||"").toUpperCase();
  const p=rankings.find(x=>normalizeName(x.name)===n && String(x.tour||"").toUpperCase()===t);
  const r=Number(p?.rank);
  return Number.isFinite(r)&&r>0?r:null;
}
function formScore(name,tour){
  const n=normalizeName(name),t=String(tour||"").toUpperCase();
  const p=formData.find(x=>normalizeName(x.name)===n&&String(x.tour||"").toUpperCase()===t);
  if(!p||!Array.isArray(p.lastMatches)||!p.lastMatches.length) return null;
  const last=p.lastMatches.slice(0,5);
  const wins=last.filter(x=>String(x.result).toUpperCase()==="W").length;
  return Math.round(wins/last.length*100);
}
function confidence(m){
  const p=probs(m); if(!p) return 40;
  const margin=Math.max(0,p.overround-1);
  return Math.max(45,Math.min(98,Math.round(96-margin*260)));
}
function score(m){
  const p=probs(m);
  let s=50;
  if(p){
    const gap=Math.abs(p.p1-p.p2);
    s += Math.max(0,20-Math.round(gap/3));
    s += 10;
  }
  const r1=rank(m.player1,m.tour), r2=rank(m.player2,m.tour);
  if(r1&&r2) s += Math.min(10,Math.round(Math.abs(r1-r2)/10));
  const f1=formScore(m.player1,m.tour), f2=formScore(m.player2,m.tour);
  if(f1!==null&&f2!==null) s += Math.min(10,Math.round(Math.abs(f1-f2)/10));
  if(m.date===localDateString()) s+=5;
  return Math.min(99,s);
}
function relevant(){
  const today=localDateString();
  return matches.filter(m=>m.date===today && m.player1 && m.player2);
}
function topMatch(){
  return [...relevant()].sort((a,b)=>score(b)-score(a))[0] || null;
}
function factorRanking(m){
  const r1=rank(m.player1,m.tour),r2=rank(m.player2,m.tour);
  if(!r1||!r2) return "–";
  return `${Math.abs(r1-r2)} Plätze`;
}
function factorForm(m){
  const f1=formScore(m.player1,m.tour),f2=formScore(m.player2,m.tour);
  if(f1===null||f2===null) return "–";
  return `${f1}% / ${f2}%`;
}
function renderStats(){
  const today=relevant();
  $("todayCount").textContent=today.length;
  $("liveCount").textContent=today.filter(m=>m.status==="live-or-started").length;
  $("atpCount").textContent=today.filter(m=>m.tour==="ATP").length;
  $("wtaCount").textContent=today.filter(m=>m.tour==="WTA").length;
}
function renderTop(){
  const m=topMatch();
  if(!m){
    $("topPickContent").classList.add("hidden");
    $("topPickEmpty").classList.remove("hidden");
    return;
  }
  $("topPickContent").classList.remove("hidden");
  $("topPickEmpty").classList.add("hidden");

  $("topTour1").textContent=m.tour||"";
  $("topTour2").textContent=m.tour||"";
  $("topP1").textContent=m.player1;
  $("topP2").textContent=m.player2;
  const r1=rank(m.player1,m.tour),r2=rank(m.player2,m.tour);
  $("topRank1").textContent=r1?`${m.tour} #${r1}`:"Ranking –";
  $("topRank2").textContent=r2?`${m.tour} #${r2}`:"Ranking –";
  $("topEvent").textContent=m.event||"–";
  $("topStart").textContent=`Heute · ${m.start||"–"}`;
  const sc=score(m), conf=confidence(m), p=probs(m);
  $("topScore").textContent=sc;
  $("topConfidence").textContent=`${conf}%`;
  $("confidenceBar").style.width=`${conf}%`;
  $("confidenceLabel").textContent=conf>=88?"SEHR HOCH":conf>=76?"HOCH":"SOLIDE";
  if(p){
    const fav=p.p1>=p.p2?m.player1:m.player2;
    const pct=Math.max(p.p1,p.p2);
    $("marketFav").textContent=`${fav} ↗ ${pct}%`;
  }else{
    $("marketFav").textContent="Keine Quote";
  }
}
function renderList(){
  const list=$("matchList");
  list.innerHTML="";
  const arr=[...relevant()].sort((a,b)=>score(b)-score(a)).slice(0,8);
  if(!arr.length){
    list.innerHTML='<div class="empty">Heute sind noch keine Matches verfügbar.</div>';
    return;
  }
  arr.forEach(m=>{
    const card=document.createElement("article");
    card.className="match-card";
    const r1=rank(m.player1,m.tour),r2=rank(m.player2,m.tour);
    card.innerHTML=`
      <div class="time">${m.start||"–"}<small>${m.status==="live-or-started"?"LIVE":"Heute"}</small></div>
      <div class="names">
        <b>${m.player1} <span>${r1?`#${r1}`:""}</span></b>
        <b>${m.player2} <span>${r2?`#${r2}`:""}</span></b>
      </div>
      <div class="badge">${score(m)}</div>`;
    card.onclick=()=>showDetails(m);
    list.appendChild(card);
  });
}
function showDetails(m){
  $("details").classList.remove("hidden");
  $("detailTitle").textContent=`${m.player1} vs. ${m.player2}`;
  const sc=score(m), p=probs(m), conf=confidence(m);
  $("detailScore").textContent=sc;
  $("detailSignal").textContent=sc>=85?"Sehr interessantes Match":sc>=70?"Interessantes Match":"Beobachten";
  $("detailText").textContent=p
    ? `Der Markt sieht ${p.p1>=p.p2?m.player1:m.player2} vorne. Ranking und Form werden berücksichtigt, sobald echte Daten vorhanden sind.`
    : "Noch keine vollständigen Marktdaten vorhanden.";
  $("factorMarket").textContent=p?`${p.p1}% / ${p.p2}%`:"–";
  $("factorRanking").textContent=factorRanking(m);
  $("factorForm").textContent=factorForm(m);
  $("factorConfidence").textContent=`${conf}%`;
  $("detailP1").textContent=m.player1;
  $("detailP2").textContent=m.player2;
  $("detailO1").textContent=odd(m.odds1);
  $("detailO2").textContent=odd(m.odds2);
  $("details").scrollIntoView({behavior:"smooth",block:"start"});
}
async function getJson(path,fallback){
  try{
    const r=await fetch(`${path}?v=${Date.now()}`,{cache:"no-store"});
    if(!r.ok) throw new Error();
    return await r.json();
  }catch{return fallback}
}
async function load(){
  $("updated").textContent="Lädt …";
  const [m,r,f]=await Promise.all([
    getJson("./data/matches.json",{matches:[],generatedAt:null}),
    getJson("./data/rankings.json",{players:[]}),
    getJson("./data/form.json",{players:[]})
  ]);
  matches=Array.isArray(m.matches)?m.matches:[];
  rankings=Array.isArray(r.players)?r.players:[];
  formData=Array.isArray(f.players)?f.players:[];
  $("updated").textContent=m.generatedAt
    ? new Date(m.generatedAt).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})
    : "Datenstand unbekannt";
  renderStats();renderTop();renderList();
}
$("refresh").onclick=load;
$("closeDetails").onclick=()=>$("details").classList.add("hidden");
$("showAllBtn").onclick=()=>document.getElementById("matchList").scrollIntoView({behavior:"smooth"});
load();
