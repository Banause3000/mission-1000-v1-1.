let MATCHES = [];
let RANKINGS = [];
let FORMS = [];
let showAll = false;
let activeDate = null;
const WATCH_KEY = "mission1000-watchlist-v1";

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

const COUNTRY_BY_PLAYER = {
  "casper ruud":"NO","joao fonseca":"BR","joao fonseca":"BR","jannik sinner":"IT","carlos alcaraz":"ES",
  "novak djokovic":"RS","alexander zverev":"DE","daniil medvedev":"RU","andrey rublev":"RU",
  "hubert hurkacz":"PL","tallon griekspoor":"NL","matteo arnaldi":"IT","alex michelsen":"US",
  "iva jovic":"US","alina korneeva":"RU","naomi osaka":"JP","iga swiatek":"PL",
  "elena rybakina":"KZ","mirra andreeva":"RU","leylah fernandez":"CA","amanda anisimova":"US",
  "liudmila samsonova":"RU","maya joint":"AU","brandon nakashima":"US","botić van de zandschulp":"NL",
  "botic van de zandschulp":"NL"
};
function countryCodeToFlag(code){
  const c=String(code||"").trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(c)) return "🎾";
  return String.fromCodePoint(...[...c].map(ch=>127397+ch.charCodeAt()));
}
function matchCountry(m,side){
  const candidates = side===1
    ? [m.player1Country,m.country1,m.player1_country,m.homeCountry,m.home_country]
    : [m.player2Country,m.country2,m.player2_country,m.awayCountry,m.away_country];
  const direct=candidates.find(Boolean);
  if(direct) return String(direct).toUpperCase();
  const name=normalizeName(side===1?m.player1:m.player2);
  return COUNTRY_BY_PLAYER[name] || "";
}
function playerFlag(name,tour,m,side){
  const code = m ? matchCountry(m,side) : COUNTRY_BY_PLAYER[normalizeName(name)];
  return countryCodeToFlag(code);
}
function matchKey(m){
  return m.id || `${m.date}|${m.start}|${m.player1}|${m.player2}`;
}
function watchlist(){
  try{return JSON.parse(localStorage.getItem(WATCH_KEY)||"[]")}catch{return []}
}
function isWatched(m){return watchlist().includes(matchKey(m))}
function toggleWatch(m){
  const key=matchKey(m),list=watchlist();
  const next=list.includes(key)?list.filter(x=>x!==key):[...list,key];
  localStorage.setItem(WATCH_KEY,JSON.stringify(next));
  renderList();renderAllMatches();renderWatchlist();
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
  $("topFlag1").textContent=playerFlag(m.player1,m.tour,m,1);
  $("topFlag2").textContent=playerFlag(m.player2,m.tour,m,2);

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
function buildMatchCard(m){
  const r1=getRank(m.player1,m.tour),r2=getRank(m.player2,m.tour);
  const el=document.createElement("article");
  el.className="match-card with-watch";
  el.innerHTML=`
    <div class="time">
      ${m.start||"–"}
      <small>${m.status==="live-or-started"?"LIVE":dataDateLabel()}</small>
    </div>
    <div class="names">
      <b data-player="1"><span class="flag-inline">${playerFlag(m.player1,m.tour,m,1)}</span>${m.player1} <span>${r1?`${m.tour} #${r1}`:""}</span></b>
      <b data-player="2"><span class="flag-inline">${playerFlag(m.player2,m.tour,m,2)}</span>${m.player2} <span>${r2?`${m.tour} #${r2}`:""}</span></b>
    </div>
    <div class="score">${missionScore(m)}</div>
    <button class="watch-star ${isWatched(m)?"active":""}" aria-label="Watchlist">${isWatched(m)?"★":"☆"}</button>
  `;
  el.onclick=e=>{
    if(e.target.closest(".watch-star")) return;
    showDetails(m);
  };
  el.querySelector(".watch-star").onclick=e=>{
    e.stopPropagation();
    toggleWatch(m);
  };

  el.querySelectorAll("[data-player]").forEach(node=>{
    node.style.cursor="pointer";
    node.onclick=e=>{
      e.stopPropagation();
      const side=Number(node.dataset.player);
      const player={
        name:side===1?m.player1:m.player2,
        tour:m.tour,
        flag:playerFlag(side===1?m.player1:m.player2,m.tour,m,side)
      };
      showPlayerProfile(player);
      document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.remove("active"));
      const playerButton=document.querySelector('.bottom-nav button[data-view="playerView"]');
      if(playerButton) playerButton.classList.add("active");
      document.querySelectorAll(".app-view").forEach(v=>v.classList.add("hidden"));
      $("playerView").classList.remove("hidden");
      window.scrollTo({top:0,behavior:"smooth"});
    };
  });

  return el;
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

  list.forEach(m=>wrap.appendChild(buildMatchCard(m)));
  $("toggleAllBtn").textContent=showAll?"Weniger":"Alle ansehen";
}
function renderAllMatches(){
  const wrap=$("allMatchesList");
  if(!wrap) return;
  wrap.innerHTML="";
  const list=[...currentMatches()].sort((a,b)=>new Date(a.startIso||0)-new Date(b.startIso||0));
  if(!list.length){
    wrap.innerHTML='<div class="empty">Keine Matches verfügbar.</div>';
    return;
  }
  list.forEach(m=>wrap.appendChild(buildMatchCard(m)));
}
function renderWatchlist(){
  const wrap=$("watchlistList");
  if(!wrap) return;
  wrap.innerHTML="";
  const keys=watchlist();
  const list=MATCHES.filter(m=>keys.includes(matchKey(m)));
  if(!list.length){
    wrap.innerHTML='<div class="empty">Noch keine Matches gespeichert. Tippe bei einem Match auf ☆.</div>';
    return;
  }
  list.sort((a,b)=>new Date(a.startIso||0)-new Date(b.startIso||0))
      .forEach(m=>wrap.appendChild(buildMatchCard(m)));
}

function uniquePlayers(){
  const map=new Map();

  MATCHES.forEach(m=>{
    [
      {name:m.player1,tour:m.tour,flag:playerFlag(m.player1,m.tour,m,1)},
      {name:m.player2,tour:m.tour,flag:playerFlag(m.player2,m.tour,m,2)}
    ].forEach(p=>{
      if(!p.name) return;
      const key=`${String(p.tour||"").toUpperCase()}|${normalizeName(p.name)}`;
      if(!map.has(key)) map.set(key,p);
    });
  });

  RANKINGS.forEach(p=>{
    const key=`${String(p.tour||"").toUpperCase()}|${normalizeName(p.name)}`;
    if(!map.has(key)){
      map.set(key,{
        name:p.name,
        tour:p.tour,
        flag:playerFlag(p.name,p.tour)
      });
    }
  });

  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"de"));
}

function showPlayerProfile(player){
  const box=$("playerProfile");
  if(!box) return;

  const rank=getRank(player.name,player.tour);
  const form=getForm(player.name,player.tour);
  const played=MATCHES.filter(m=>
    normalizeName(m.player1)===normalizeName(player.name) ||
    normalizeName(m.player2)===normalizeName(player.name)
  ).length;

  box.classList.remove("empty-state");
  box.innerHTML=`
    <div class="profile-avatar">${player.flag||"🎾"}</div>
    <div>
      <span class="eyebrow">${player.tour||"TENNIS"}</span>
      <h3>${player.name}</h3>
      <p>${rank?`${player.tour} #${rank}`:"Ranking noch nicht verfügbar"}</p>
    </div>

    <div class="profile-metrics">
      <article>
        <span>RANKING</span>
        <b>${rank?`#${rank}`:"–"}</b>
      </article>
      <article>
        <span>FORM</span>
        <b>${form?`${form.pct}%`:"–"}</b>
      </article>
      <article>
        <span>MATCHES</span>
        <b>${played}</b>
      </article>
    </div>
  `;
}

function renderPlayerSearch(query=""){
  const wrap=$("playerResults");
  if(!wrap) return;

  const q=normalizeName(query);
  const players=uniquePlayers()
    .filter(p=>!q || normalizeName(p.name).includes(q))
    .slice(0,16);

  wrap.innerHTML="";

  if(!players.length){
    wrap.innerHTML='<div class="empty">Kein Spieler gefunden.</div>';
    return;
  }

  players.forEach(p=>{
    const row=document.createElement("div");
    row.className="player-result";
    const r=getRank(p.name,p.tour);
    row.innerHTML=`
      <span class="flag">${p.flag||"🎾"}</span>
      <button type="button">
        <strong>${p.name}</strong>
        <small>${p.tour||""}${r?` · #${r}`:""}</small>
      </button>
    `;
    row.querySelector("button").onclick=()=>showPlayerProfile(p);
    wrap.appendChild(row);
  });
}

function renderAI(){
  const box=$("aiReport");
  if(!box) return;

  const m=topMatch();

  if(!m){
    box.textContent="Noch kein Match für einen Mission Report verfügbar.";
    $("aiScore").textContent="0";
    $("aiMatchTitle").textContent="–";
    $("aiMatchMeta").textContent="–";
    $("aiMarket").textContent="–";
    $("aiRanking").textContent="–";
    $("aiForm").textContent="–";
    $("aiConfidence").textContent="–";
    return;
  }

  const mk=market(m);
  const r1=getRank(m.player1,m.tour),r2=getRank(m.player2,m.tour);
  const f1=getForm(m.player1,m.tour),f2=getForm(m.player2,m.tour);
  const sc=missionScore(m);
  const conf=confidence(m);

  $("aiScore").textContent=sc;
  setRing($("aiScore").parentElement,sc);
  $("aiMatchTitle").textContent=`${m.player1} vs. ${m.player2}`;
  $("aiMatchMeta").textContent=`${m.tour||""} · ${m.event||"Turnier"} · ${m.start||"–"}`;

  $("aiMarket").textContent=mk?`${mk.p1}% / ${mk.p2}%`:"–";
  $("aiRanking").textContent=r1&&r2?`${r1} / ${r2}`:"–";
  $("aiForm").textContent=f1&&f2?`${f1.pct}% / ${f2.pct}%`:"–";
  $("aiConfidence").textContent=`${conf}%`;

  let parts=[];
  parts.push(`${playerFlag(m.player1,m.tour,m,1)} ${m.player1} trifft auf ${playerFlag(m.player2,m.tour,m,2)} ${m.player2}.`);

  if(mk){
    const fav=mk.p1>=mk.p2?m.player1:m.player2;
    const pct=Math.max(mk.p1,mk.p2);
    parts.push(`Der Markt sieht ${fav} aktuell mit rund ${pct} % vorne.`);
  }else{
    parts.push("Für den Marktvergleich fehlen aktuell vollständige Quoten.");
  }

  if(r1&&r2){
    const leader=r1<r2?m.player1:m.player2;
    parts.push(`Das Ranking unterstützt ${leader}: Vorteil von ${Math.abs(r1-r2)} Plätzen.`);
  }else{
    parts.push("Der Rankingvergleich ist noch nicht vollständig.");
  }

  if(f1&&f2){
    if(f1.pct===f2.pct){
      parts.push(`Die vorhandenen Formdaten sind mit ${f1.pct} % ausgeglichen.`);
    }else{
      const leader=f1.pct>f2.pct?m.player1:m.player2;
      parts.push(`Die Formdaten sprechen aktuell eher für ${leader}.`);
    }
  }else{
    parts.push("Formdaten sind noch nicht vollständig verfügbar.");
  }

  parts.push(`Mission Score ${sc}/100, Confidence ${conf} %.`);
  box.textContent=parts.join(" ");
}

document.querySelectorAll(".bottom-nav button[data-view]").forEach(button=>{
  button.onclick=()=>{
    document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.remove("active"));
    button.classList.add("active");
    document.querySelectorAll(".app-view").forEach(v=>v.classList.add("hidden"));
    const view=$(button.dataset.view);
    if(view) view.classList.remove("hidden");
    window.scrollTo({top:0,behavior:"smooth"});
  };
});



if($("playerSearch")){
  $("playerSearch").addEventListener("input",e=>renderPlayerSearch(e.target.value));
}

load();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(console.warn);
  });
}
