let MATCHES = [];
let RANKINGS = [];
let FORMS = [];
let showAll = false;
let activeDate = null;

const $ = id => document.getElementById(id);

function normalizeName(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[’'`´]/g,"")
    .replace(/[-–—]/g," ")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();
}
function odd(v){
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2).replace(".",",") : "–";
}
function dayString(date = new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function getRank(name,tour){
  const n=normalizeName(name),t=String(tour||"").toUpperCase();
  const p=RANKINGS.find(x=>normalizeName(x.name)===n && String(x.tour||"").toUpperCase()===t);
  const r=Number(p?.rank);
  return Number.isFinite(r)&&r>0?r:null;
}
function getForm(name,tour){
  const n=normalizeName(name),t=String(tour||"").toUpperCase();
  const p=FORMS.find(x=>normalizeName(x.name)===n && String(x.tour||"").toUpperCase()===t);
  if(!p || !Array.isArray(p.lastMatches) || !p.lastMatches.length) return null;
  const last=p.lastMatches.slice(0,5);
  const wins=last.filter(x=>String(x.result||"").toUpperCase()==="W").length;
  return {wins,total:last.length,pct:Math.round(wins/last.length*100)};
}
function market(m){
  const a=Number(m.odds1),b=Number(m.odds2);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<=1||b<=1) return null;
  const x=1/a,y=1/b,total=x+y;
  const p1=Math.round(x/total*100);
  return {p1,p2:100-p1,overround:total};
}
function confidence(m){
  const p=market(m);
  if(!p) return 45;
  const margin=Math.max(0,p.overround-1);
  return Math.max(48,Math.min(97,Math.round(96-margin*260)));
}
function missionScore(m){
  let s=48;
  const mk=market(m);
  if(mk){
    const gap=Math.abs(mk.p1-mk.p2);
    s+=10+Math.max(0,15-Math.round(gap/4));
  }
  const r1=getRank(m.player1,m.tour),r2=getRank(m.player2,m.tour);
  if(r1&&r2) s+=Math.min(10,Math.round(Math.abs(r1-r2)/8));
  const f1=getForm(m.player1,m.tour),f2=getForm(m.player2,m.tour);
  if(f1&&f2) s+=Math.min(10,Math.round(Math.abs(f1.pct-f2.pct)/8));
  if(m.status==="live-or-started") s+=4;
  return Math.min(99,s);
}
function resolveActiveDate(){
  const today=dayString();
  if(MATCHES.some(m=>m.date===today)) return today;

  const dates=[...new Set(MATCHES.map(m=>m.date).filter(Boolean))].sort();
  return dates.at(-1) || today;
}
function currentMatches(){
  return MATCHES.filter(m=>m.date===activeDate && m.player1 && m.player2);
}
function scoreLabel(s){
  if(s>=86) return "Sehr interessantes Match";
  if(s>=72) return "Interessantes Match";
  if(s>=60) return "Beobachten";
  return "Standard";
}
function setRing(element,value){
  element.style.setProperty("--value",String(value));
}
function dataDateLabel(){
  if(activeDate===dayString()) return "Heute";
  if(!activeDate) return "–";
  const d=new Date(`${activeDate}T12:00:00`);
  return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});
}
function updateSystemStatus(matchesPayload){
  const isToday=activeDate===dayString();
  $("statusTitle").textContent=isToday ? "Mission Control online" : "Letzten verfügbaren Datenstand geladen";
  $("statusText").textContent=isToday
    ? "Aktuelle Matches aus deinen vorhandenen Mission-1000-Daten."
    : "Für heute sind noch keine Matches in matches.json. Die App zeigt deshalb automatisch den neuesten verfügbaren Spieltag.";
  $("dataDate").textContent=dataDateLabel();

  if(matchesPayload?.generatedAt){
    $("updatedAt").textContent=new Date(matchesPayload.generatedAt).toLocaleString("de-DE",{
      day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"
    });
  }else{
    $("updatedAt").textContent="Datenstand –";
  }
}
function renderStats(){
  const list=currentMatches();
  $("todayCount").textContent=list.length;
  $("liveCount").textContent=list.filter(m=>m.status==="live-or-started").length;
  $("atpCount").textContent=list.filter(m=>String(m.tour).toUpperCase()==="ATP").length;
  $("wtaCount").textContent=list.filter(m=>String(m.tour).toUpperCase()==="WTA").length;
}
function topMatch(){
  return [...currentMatches()].sort((a,b)=>missionScore(b)-missionScore(a))[0] || null;
}
function renderTop(){
  const m=topMatch();
  if(!m){
    $("topContent").classList.add("hidden");
    $("topEmpty").classList.remove("hidden");
    return;
  }

  $("topContent").classList.remove("hidden");
  $("topEmpty").classList.add("hidden");

  $("topMeta1").textContent=m.tour||"";
  $("topMeta2").textContent=m.tour||"";
  $("topPlayer1").textContent=m.player1;
  $("topPlayer2").textContent=m.player2;

  const r1=getRank(m.player1,m.tour),r2=getRank(m.player2,m.tour);
  $("topRank1").textContent=r1?`${m.tour} #${r1}`:"Ranking –";
  $("topRank2").textContent=r2?`${m.tour} #${r2}`:"Ranking –";

  $("topEvent").textContent=m.event||"Turnier";
  $("topStart").textContent=`${dataDateLabel()} · ${m.start||"–"}`;

  const sc=missionScore(m);
  const conf=confidence(m);
  const mk=market(m);

  $("topScore").textContent=sc;
  setRing($("topScore").parentElement,sc);

  $("topConfidence").textContent=`${conf}%`;
  $("confidenceBar").style.width=`${conf}%`;
  $("confidenceLabel").textContent=conf>=88?"SEHR HOCH":conf>=76?"HOCH":"SOLIDE";

  if(mk){
    const fav=mk.p1>=mk.p2?m.player1:m.player2;
    $("marketTrend").textContent=`${fav} ↗ ${Math.max(mk.p1,mk.p2)}%`;
  }else{
    $("marketTrend").textContent="Keine vollständige Quote";
  }
}
function renderList(){
  const wrap=$("matchList");
  wrap.innerHTML="";
  let list=[...currentMatches()].sort((a,b)=>missionScore(b)-missionScore(a));
  if(!showAll) list=list.slice(0,6);

  $("listTitle").textContent=activeDate===dayString()?"Wichtige Matches":"Neuester Spieltag";

  if(!list.length){
    wrap.innerHTML='<div class="empty">Keine Matches verfügbar.</div>';
    return;
  }

  list.forEach(m=>{
    const r1=getRank(m.player1,m.tour),r2=getRank(m.player2,m.tour);
    const el=document.createElement("article");
    el.className="match-card";
    el.innerHTML=`
      <div class="time">
        ${m.start||"–"}
        <small>${m.status==="live-or-started"?"LIVE":dataDateLabel()}</small>
      </div>
      <div class="names">
        <b>${m.player1} <span>${r1?`${m.tour} #${r1}`:""}</span></b>
        <b>${m.player2} <span>${r2?`${m.tour} #${r2}`:""}</span></b>
      </div>
      <div class="score">${missionScore(m)}</div>
    `;
    el.onclick=()=>showDetails(m);
    wrap.appendChild(el);
  });

  $("toggleAllBtn").textContent=showAll?"Weniger":"Alle ansehen";
}
function showDetails(m){
  const sc=missionScore(m);
  const mk=market(m);
  const conf=confidence(m);
  const r1=getRank(m.player1,m.tour),r2=getRank(m.player2,m.tour);
  const f1=getForm(m.player1,m.tour),f2=getForm(m.player2,m.tour);

  $("detailsPanel").classList.remove("hidden");
  $("detailTitle").textContent=`${m.player1} vs. ${m.player2}`;
  $("detailScore").textContent=sc;
  setRing($("detailScore").parentElement,sc);
  $("detailSignal").textContent=scoreLabel(sc);

  let text="Die Analyse nutzt nur Daten, die in deiner App tatsächlich vorhanden sind.";
  if(mk){
    const fav=mk.p1>=mk.p2?m.player1:m.player2;
    text=`Der Markt sieht ${fav} vorne.`;
  }
  if(r1&&r2){
    text+=` Im Ranking liegt ${r1<r2?m.player1:m.player2} ${Math.abs(r1-r2)} Plätze vor dem Gegner.`;
  }
  if(f1&&f2){
    text+=` Die vorhandene Form liegt bei ${f1.pct}% zu ${f2.pct}%.`;
  }
  $("detailNarrative").textContent=text;

  $("factorMarket").textContent=mk?`${mk.p1}% / ${mk.p2}%`:"–";
  $("factorRanking").textContent=r1&&r2?`${r1} / ${r2}`:"–";
  $("factorForm").textContent=f1&&f2?`${f1.pct}% / ${f2.pct}%`:"–";
  $("factorConfidence").textContent=`${conf}%`;

  $("detailP1").textContent=m.player1;
  $("detailP2").textContent=m.player2;
  $("detailO1").textContent=odd(m.odds1);
  $("detailO2").textContent=odd(m.odds2);

  $("detailsPanel").scrollIntoView({behavior:"smooth",block:"start"});
}
async function fetchJson(path,fallback){
  try{
    const res=await fetch(`${path}?v=${Date.now()}`,{cache:"no-store"});
    if(!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return await res.json();
  }catch(err){
    console.warn(err);
    return fallback;
  }
}
async function load(){
  $("statusTitle").textContent="Daten werden geladen";
  $("statusText").textContent="Mission Control verbindet sich mit deinen JSON-Dateien.";

  const [matchesPayload,rankPayload,formPayload]=await Promise.all([
    fetchJson("./data/matches.json",{matches:[]}),
    fetchJson("./data/rankings.json",{players:[]}),
    fetchJson("./data/form.json",{players:[]})
  ]);

  MATCHES=Array.isArray(matchesPayload.matches)?matchesPayload.matches:[];
  RANKINGS=Array.isArray(rankPayload.players)?rankPayload.players:[];
  FORMS=Array.isArray(formPayload.players)?formPayload.players:[];

  activeDate=resolveActiveDate();
  updateSystemStatus(matchesPayload);
  renderStats();
  renderTop();
  renderList();
}
$("refreshBtn").onclick=load;
$("toggleAllBtn").onclick=()=>{showAll=!showAll;renderList();};
$("closeDetailsBtn").onclick=()=>$("detailsPanel").classList.add("hidden");

load();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
  });
}
