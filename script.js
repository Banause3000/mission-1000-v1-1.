// Mission 1000 v2.1.0
// Core refactor: one source of truth, defensive JSON loading, no invented data.

const $ = id => document.getElementById(id);

const STATE = {
  matches: [],
  rankings: [],
  forms: [],
  players: [],
  activeDate: null,
  showAll: false
};

const WATCH_KEY = "mission1000-watchlist-v2";

function normalizeName(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´]/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function dayString(date = new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function odd(value){
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "–";
}

function codeToFlag(code){
  const c = String(code || "").trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(c)) return "🎾";
  return String.fromCodePoint(...[...c].map(ch => 127397 + ch.charCodeAt()));
}

function playerMeta(name, tour){
  const n = normalizeName(name);
  const t = String(tour || "").toUpperCase();
  return STATE.players.find(p =>
    normalizeName(p.name) === n &&
    (!t || String(p.tour || "").toUpperCase() === t)
  ) || null;
}

function directCountry(match, side){
  const fields = side === 1
    ? [match.player1Country, match.country1, match.player1_country, match.homeCountry, match.home_country]
    : [match.player2Country, match.country2, match.player2_country, match.awayCountry, match.away_country];
  return fields.find(Boolean) || "";
}

function playerFlag(name, tour, match=null, side=1){
  const meta = playerMeta(name, tour);
  if(meta?.country) return codeToFlag(meta.country);

  const direct = match ? directCountry(match, side) : "";
  if(direct) return codeToFlag(direct);

  return "🎾";
}

function rankingCandidates(){
  const src = STATE.rankings;
  if(Array.isArray(src)) return src;
  return [];
}

function extractRank(item){
  if(!item || typeof item !== "object") return null;
  const raw =
    item.rank ??
    item.ranking ??
    item.position ??
    item.pos ??
    item.currentRank ??
    item.current_rank ??
    item.singlesRank ??
    item.singles_rank;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getRank(name, tour){
  const n = normalizeName(name);
  const t = String(tour || "").toUpperCase();

  const found = rankingCandidates().find(p => {
    const pname = p.name ?? p.player ?? p.playerName ?? p.player_name ?? p.fullName ?? p.full_name;
    const ptour = String(p.tour ?? p.type ?? p.league ?? "").toUpperCase();
    return normalizeName(pname) === n && (!ptour || !t || ptour === t);
  });

  return extractRank(found);
}

function formCandidates(){
  const src = STATE.forms;
  if(Array.isArray(src)) return src;
  return [];
}

function getForm(name, tour){
  const n = normalizeName(name);
  const t = String(tour || "").toUpperCase();

  const found = formCandidates().find(p => {
    const pname = p.name ?? p.player ?? p.playerName ?? p.player_name ?? p.fullName ?? p.full_name;
    const ptour = String(p.tour ?? p.type ?? p.league ?? "").toUpperCase();
    return normalizeName(pname) === n && (!ptour || !t || ptour === t);
  });

  if(!found) return null;

  const list =
    (Array.isArray(found.lastMatches) && found.lastMatches) ||
    (Array.isArray(found.matches) && found.matches) ||
    (Array.isArray(found.form) && found.form) ||
    [];

  if(list.length){
    const last = list.slice(0,5);
    const wins = last.filter(m => {
      if(typeof m === "string") return m.trim().toUpperCase().startsWith("W");
      return String(m.result ?? m.outcome ?? m.wl ?? "").toUpperCase() === "W";
    }).length;

    return {
      wins,
      total:last.length,
      pct:Math.round((wins/last.length)*100)
    };
  }

  const wins = Number(found.wins ?? found.last5Wins ?? found.formWins);
  const total = Number(found.total ?? found.last5Total ?? found.formTotal ?? 5);

  if(Number.isFinite(wins) && Number.isFinite(total) && total > 0){
    return {
      wins,
      total,
      pct:Math.round((wins/total)*100)
    };
  }

  return null;
}

function market(match){
  const a = Number(match.odds1);
  const b = Number(match.odds2);

  if(!Number.isFinite(a) || !Number.isFinite(b) || a <= 1 || b <= 1){
    return null;
  }

  const x = 1/a;
  const y = 1/b;
  const total = x+y;

  return {
    p1: Math.round((x/total)*100),
    p2: Math.round((y/total)*100),
    overround: total
  };
}


function marketComponent(match){
  const mk = market(match);
  if(!mk) return {score:0,max:30,available:false};

  const gap = Math.abs(mk.p1 - mk.p2);
  const score = Math.max(8, Math.min(30, Math.round(30 - gap*0.18)));
  return {score,max:30,available:true};
}

function rankingComponent(match){
  const r1 = getRank(match.player1, match.tour);
  const r2 = getRank(match.player2, match.tour);
  if(!r1 || !r2) return {score:0,max:20,available:false};

  const diff = Math.abs(r1-r2);
  const score = Math.min(20, Math.max(4, Math.round(4 + diff/4)));
  return {score,max:20,available:true,r1,r2,diff};
}

function formComponent(match){
  const f1 = getForm(match.player1, match.tour);
  const f2 = getForm(match.player2, match.tour);
  if(!f1 || !f2) return {score:0,max:20,available:false};

  const diff = Math.abs(f1.pct-f2.pct);
  const score = Math.min(20, Math.max(5, Math.round(5 + diff/5)));
  return {score,max:20,available:true,f1,f2,diff};
}

function scoreComponents(match){
  return {
    market:marketComponent(match),
    ranking:rankingComponent(match),
    form:formComponent(match)
  };
}

function missionScore(match){
  const parts = scoreComponents(match);
  const available = [parts.market,parts.ranking,parts.form].filter(x=>x.available);

  // Until H2H/surface/stats arrive, normalize only over the components we truly have.
  if(!available.length) return 50;

  const earned = available.reduce((s,x)=>s+x.score,0);
  const possible = available.reduce((s,x)=>s+x.max,0);

  // Scale current evidence to 50..95 so missing future modules do not punish a match.
  const ratio = possible ? earned/possible : .5;
  let score = Math.round(50 + ratio*45);

  if(match.status === "live-or-started") score = Math.min(99,score+2);
  return Math.max(0,Math.min(99,score));
}

function confidence(match){
  const mk = market(match);
  if(!mk) return 50;

  const margin = Math.max(0, mk.overround - 1);
  return Math.max(50, Math.min(97, Math.round(96 - margin*260)));
}



function scoreLabel(score){
  if(score >= 86) return "Sehr interessantes Match";
  if(score >= 72) return "Interessantes Match";
  if(score >= 60) return "Beobachten";
  return "Standard";
}

function resolveActiveDate(){
  const today = dayString();

  if(STATE.matches.some(m => m.date === today)) return today;

  const dates = [...new Set(STATE.matches.map(m => m.date).filter(Boolean))].sort();
  return dates.at(-1) || today;
}

function currentMatches(){
  return STATE.matches.filter(m =>
    m.date === STATE.activeDate &&
    m.player1 &&
    m.player2
  );
}

function dataDateLabel(){
  if(!STATE.activeDate) return "–";
  if(STATE.activeDate === dayString()) return "Heute";

  const d = new Date(`${STATE.activeDate}T12:00:00`);
  if(Number.isNaN(d.getTime())) return STATE.activeDate;

  return d.toLocaleDateString("de-DE", {
    day:"2-digit",
    month:"2-digit"
  });
}

function setRing(element, value){
  if(element) element.style.setProperty("--value", String(value));
}

function matchKey(match){
  return match.id || `${match.date}|${match.start}|${match.player1}|${match.player2}`;
}

function watchlistKeys(){
  try{
    const parsed = JSON.parse(localStorage.getItem(WATCH_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  }catch{
    return [];
  }
}

function isWatched(match){
  return watchlistKeys().includes(matchKey(match));
}

function toggleWatch(match){
  const key = matchKey(match);
  const current = watchlistKeys();
  const next = current.includes(key)
    ? current.filter(x => x !== key)
    : [...current, key];

  localStorage.setItem(WATCH_KEY, JSON.stringify(next));
  renderMatchList();
  renderAllMatches();
  renderWatchlist();
}

function topMatch(){
  return [...currentMatches()]
    .sort((a,b) => missionScore(b) - missionScore(a))[0] || null;
}

function renderStatus(payload){
  const list = currentMatches();
  const isToday = STATE.activeDate === dayString();

  $("statusTitle").textContent = isToday
    ? "Mission Control online"
    : "Neuester Datenstand aktiv";

  $("statusText").textContent = isToday
    ? "Aktuelle Matches aus deinen Mission-1000-Daten."
    : "Für heute liegen noch keine Matches vor. Es wird automatisch der neueste verfügbare Spieltag gezeigt.";

  $("mcMatches").textContent = list.length;

  // "Analyzed" means the app can produce a Mission Score from the match record.
  // Every valid current match qualifies. We do NOT require rankings/form/odds.
  $("analyzedCount").textContent = list.length;

  const best = list.length
    ? Math.max(...list.map(m => missionScore(m)))
    : 0;

  $("bestScore").textContent = best;
  $("dataDate").textContent = dataDateLabel();

  const playerSlots = list.length * 2;
  const rankedSlots = list.reduce((sum,m)=>
    sum + (getRank(m.player1,m.tour)?1:0) + (getRank(m.player2,m.tour)?1:0),0);
  const formSlots = list.reduce((sum,m)=>
    sum + (getForm(m.player1,m.tour)?1:0) + (getForm(m.player2,m.tour)?1:0),0);

  $("rankingCoverage").textContent = playerSlots ? `${Math.round(rankedSlots/playerSlots*100)}%` : "0%";
  $("formCoverage").textContent = playerSlots ? `${Math.round(formSlots/playerSlots*100)}%` : "0%";

  if(payload?.generatedAt){
    $("updatedAt").textContent = new Date(payload.generatedAt).toLocaleString("de-DE", {
      day:"2-digit",
      month:"2-digit",
      hour:"2-digit",
      minute:"2-digit"
    });
  }else{
    $("updatedAt").textContent = "Datenstand –";
  }
}

function renderStats(){
  const list = currentMatches();

  $("todayCount").textContent = list.length;
  $("liveCount").textContent = list.filter(m => m.status === "live-or-started").length;
  $("atpCount").textContent = list.filter(m => String(m.tour).toUpperCase() === "ATP").length;
  $("wtaCount").textContent = list.filter(m => String(m.tour).toUpperCase() === "WTA").length;
}

function renderTop(){
  const match = topMatch();

  if(!match){
    $("topContent").classList.add("hidden");
    $("topEmpty").classList.remove("hidden");
    return;
  }

  $("topContent").classList.remove("hidden");
  $("topEmpty").classList.add("hidden");

  $("topMeta1").textContent = match.tour || "";
  $("topMeta2").textContent = match.tour || "";
  $("topPlayer1").textContent = match.player1;
  $("topPlayer2").textContent = match.player2;
  $("topFlag1").textContent = playerFlag(match.player1, match.tour, match, 1);
  $("topFlag2").textContent = playerFlag(match.player2, match.tour, match, 2);

  const r1 = getRank(match.player1, match.tour);
  const r2 = getRank(match.player2, match.tour);

  $("topRank1").textContent = r1 ? `${match.tour} #${r1}` : "Ranking –";
  $("topRank2").textContent = r2 ? `${match.tour} #${r2}` : "Ranking –";

  $("topEvent").textContent = match.event || "Turnier";
  $("topStart").textContent = `${dataDateLabel()} · ${match.start || "–"}`;

  const score = missionScore(match);
  const conf = confidence(match);
  const mk = market(match);

  $("topScore").textContent = score;
  setRing($("topScore").parentElement, score);

  $("topConfidence").textContent = `${conf}%`;
  $("confidenceBar").style.width = `${conf}%`;
  $("confidenceLabel").textContent = conf >= 88 ? "SEHR HOCH" : conf >= 76 ? "HOCH" : "SOLIDE";

  if(mk){
    const fav = mk.p1 >= mk.p2 ? match.player1 : match.player2;
    $("marketTrend").textContent = `${fav} ↗ ${Math.max(mk.p1,mk.p2)}%`;
  }else{
    $("marketTrend").textContent = "Keine vollständige Quote";
  }
}

function openPlayer(player){
  showPlayerProfile(player);

  document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.remove("active"));
  const target = document.querySelector('.bottom-nav button[data-view="playerView"]');
  if(target) target.classList.add("active");

  document.querySelectorAll(".app-view").forEach(v => v.classList.add("hidden"));
  $("playerView").classList.remove("hidden");
  window.scrollTo({top:0, behavior:"smooth"});
}

function buildMatchCard(match){
  const r1 = getRank(match.player1, match.tour);
  const r2 = getRank(match.player2, match.tour);

  const el = document.createElement("article");
  el.className = "match-card with-watch";

  el.innerHTML = `
    <div class="time">
      ${match.start || "–"}
      <small>${match.status === "live-or-started" ? "LIVE" : dataDateLabel()}</small>
    </div>

    <div class="names">
      <b data-player="1">
        <span class="flag-inline">${playerFlag(match.player1,match.tour,match,1)}</span>
        ${match.player1}
        <span>${r1 ? `${match.tour} #${r1}` : ""}</span>
      </b>
      <b data-player="2">
        <span class="flag-inline">${playerFlag(match.player2,match.tour,match,2)}</span>
        ${match.player2}
        <span>${r2 ? `${match.tour} #${r2}` : ""}</span>
      </b>
    </div>

    <div class="score">${missionScore(match)}</div>
    <button class="watch-star ${isWatched(match) ? "active" : ""}" aria-label="Watchlist">
      ${isWatched(match) ? "★" : "☆"}
    </button>
  `;

  el.onclick = e => {
    if(e.target.closest(".watch-star") || e.target.closest("[data-player]")) return;
    showDetails(match);
  };

  el.querySelector(".watch-star").onclick = e => {
    e.stopPropagation();
    toggleWatch(match);
  };

  el.querySelectorAll("[data-player]").forEach(node => {
    node.style.cursor = "pointer";
    node.onclick = e => {
      e.stopPropagation();
      const side = Number(node.dataset.player);
      const name = side === 1 ? match.player1 : match.player2;
      openPlayer({
        name,
        tour:match.tour,
        flag:playerFlag(name, match.tour, match, side)
      });
    };
  });

  return el;
}

function renderMatchList(){
  const wrap = $("matchList");
  wrap.innerHTML = "";

  let list = [...currentMatches()]
    .sort((a,b) => missionScore(b) - missionScore(a));

  if(!STATE.showAll) list = list.slice(0,6);

  $("listTitle").textContent = STATE.activeDate === dayString()
    ? "Wichtige Matches"
    : "Neuester Spieltag";

  if(!list.length){
    wrap.innerHTML = '<div class="empty">Keine Matches verfügbar.</div>';
    return;
  }

  list.forEach(m => wrap.appendChild(buildMatchCard(m)));
  $("toggleAllBtn").textContent = STATE.showAll ? "Weniger" : "Alle ansehen";
}

function renderAllMatches(){
  const wrap = $("allMatchesList");
  if(!wrap) return;

  wrap.innerHTML = "";

  const list = [...currentMatches()]
    .sort((a,b) => String(a.start || "").localeCompare(String(b.start || "")));

  if(!list.length){
    wrap.innerHTML = '<div class="empty">Keine Matches verfügbar.</div>';
    return;
  }

  list.forEach(m => wrap.appendChild(buildMatchCard(m)));
}

function renderWatchlist(){
  const wrap = $("watchlistList");
  if(!wrap) return;

  wrap.innerHTML = "";

  const keys = watchlistKeys();
  const list = STATE.matches.filter(m => keys.includes(matchKey(m)));

  if(!list.length){
    wrap.innerHTML = '<div class="empty">Noch keine Matches gespeichert. Tippe bei einem Match auf ☆.</div>';
    return;
  }

  list.forEach(m => wrap.appendChild(buildMatchCard(m)));
}

function uniquePlayers(){
  const map = new Map();

  STATE.matches.forEach(m => {
    [
      {name:m.player1, tour:m.tour, flag:playerFlag(m.player1,m.tour,m,1)},
      {name:m.player2, tour:m.tour, flag:playerFlag(m.player2,m.tour,m,2)}
    ].forEach(p => {
      if(!p.name) return;
      const key = `${String(p.tour || "").toUpperCase()}|${normalizeName(p.name)}`;
      if(!map.has(key)) map.set(key,p);
    });
  });

  STATE.rankings.forEach(p => {
    const key = `${String(p.tour || "").toUpperCase()}|${normalizeName(p.name)}`;
    if(!map.has(key)){
      map.set(key,{
        name:p.name,
        tour:p.tour,
        flag:playerFlag(p.name,p.tour)
      });
    }
  });

  return [...map.values()].sort((a,b) => a.name.localeCompare(b.name,"de"));
}

function showPlayerProfile(player){
  const box = $("playerProfile");
  if(!box) return;

  const rank = getRank(player.name, player.tour);
  const form = getForm(player.name, player.tour);
  const played = STATE.matches.filter(m =>
    normalizeName(m.player1) === normalizeName(player.name) ||
    normalizeName(m.player2) === normalizeName(player.name)
  ).length;

  box.classList.remove("empty-state");
  box.innerHTML = `
    <div class="profile-avatar">${player.flag || "🎾"}</div>
    <div>
      <span class="eyebrow">${player.tour || "TENNIS"}</span>
      <h3>${player.name}</h3>
      <p>${rank ? `${player.tour} #${rank}` : "Ranking noch nicht verfügbar"}</p>
    </div>

    <div class="profile-metrics">
      <article><span>RANKING</span><b>${rank ? `#${rank}` : "–"}</b></article>
      <article><span>FORM</span><b>${form ? `${form.pct}%` : "–"}</b></article>
      <article><span>MATCHES</span><b>${played}</b></article>
    </div>
  `;
}

function renderPlayerSearch(query=""){
  const wrap = $("playerResults");
  if(!wrap) return;

  const q = normalizeName(query);

  const players = uniquePlayers()
    .filter(p => !q || normalizeName(p.name).includes(q))
    .slice(0,20);

  wrap.innerHTML = "";

  if(!players.length){
    wrap.innerHTML = '<div class="empty">Kein Spieler gefunden.</div>';
    return;
  }

  players.forEach(player => {
    const row = document.createElement("div");
    row.className = "player-result";

    const rank = getRank(player.name, player.tour);

    row.innerHTML = `
      <span class="flag">${player.flag || "🎾"}</span>
      <button type="button">
        <strong>${player.name}</strong>
        <small>${player.tour || ""}${rank ? ` · #${rank}` : ""}</small>
      </button>
    `;

    row.querySelector("button").onclick = () => showPlayerProfile(player);
    wrap.appendChild(row);
  });
}

function renderAI(){
  const box = $("aiReport");
  if(!box) return;

  const match = topMatch();

  if(!match){
    box.textContent = "Noch kein Match für einen Mission Report verfügbar.";
    return;
  }

  const mk = market(match);
  const r1 = getRank(match.player1, match.tour);
  const r2 = getRank(match.player2, match.tour);
  const f1 = getForm(match.player1, match.tour);
  const f2 = getForm(match.player2, match.tour);
  const score = missionScore(match);
  const conf = confidence(match);

  $("aiScore").textContent = score;
  setRing($("aiScore").parentElement, score);
  $("aiMatchTitle").textContent = `${match.player1} vs. ${match.player2}`;
  $("aiMatchMeta").textContent = `${match.tour || ""} · ${match.event || "Turnier"} · ${match.start || "–"}`;

  $("aiMarket").textContent = mk ? `${mk.p1}% / ${mk.p2}%` : "–";
  $("aiRanking").textContent = r1 && r2 ? `${r1} / ${r2}` : "–";
  $("aiForm").textContent = f1 && f2 ? `${f1.pct}% / ${f2.pct}%` : "–";
  $("aiConfidence").textContent = `${conf}%`;

  const parts = [
    `${playerFlag(match.player1,match.tour,match,1)} ${match.player1} trifft auf ${playerFlag(match.player2,match.tour,match,2)} ${match.player2}.`
  ];

  if(mk){
    const fav = mk.p1 >= mk.p2 ? match.player1 : match.player2;
    parts.push(`Der Markt sieht ${fav} mit rund ${Math.max(mk.p1,mk.p2)} % vorne.`);
  }

  if(r1 && r2){
    const leader = r1 < r2 ? match.player1 : match.player2;
    parts.push(`Im Ranking liegt ${leader} ${Math.abs(r1-r2)} Plätze vor dem Gegner.`);
  }

  if(f1 && f2){
    const leader = f1.pct === f2.pct ? null : (f1.pct > f2.pct ? match.player1 : match.player2);
    parts.push(leader ? `Die vorhandene Form spricht eher für ${leader}.` : "Die vorhandene Form ist ausgeglichen.");
  }

  parts.push(`Mission Score ${score}/100, Confidence ${conf} %.`);
  box.textContent = parts.join(" ");
}

function showDetails(match){
  const score = missionScore(match);
  const mk = market(match);
  const conf = confidence(match);
  const r1 = getRank(match.player1, match.tour);
  const r2 = getRank(match.player2, match.tour);
  const f1 = getForm(match.player1, match.tour);
  const f2 = getForm(match.player2, match.tour);

  $("detailsPanel").classList.remove("hidden");
  $("detailTitle").textContent = `${match.player1} vs. ${match.player2}`;
  $("detailScore").textContent = score;
  setRing($("detailScore").parentElement, score);
  $("detailSignal").textContent = scoreLabel(score);

  let text = "Die Analyse nutzt nur Daten, die tatsächlich vorhanden sind.";

  if(mk){
    const fav = mk.p1 >= mk.p2 ? match.player1 : match.player2;
    text = `Der Markt sieht ${fav} vorne.`;
  }

  if(r1 && r2){
    text += ` Im Ranking liegt ${r1 < r2 ? match.player1 : match.player2} ${Math.abs(r1-r2)} Plätze vorn.`;
  }

  if(f1 && f2){
    text += ` Die Formwerte liegen bei ${f1.pct} % zu ${f2.pct} %.`;
  }

  $("detailNarrative").textContent = text;
  $("factorMarket").textContent = mk ? `${mk.p1}% / ${mk.p2}%` : "–";
  $("factorRanking").textContent = r1 && r2 ? `${r1} / ${r2}` : "–";
  $("factorForm").textContent = f1 && f2 ? `${f1.pct}% / ${f2.pct}%` : "–";
  $("factorConfidence").textContent = `${conf}%`;

  const parts = scoreComponents(match);
  $("scoreMarket").textContent = parts.market.available ? `${parts.market.score}/${parts.market.max}` : `0/${parts.market.max}`;
  $("scoreRanking").textContent = parts.ranking.available ? `${parts.ranking.score}/${parts.ranking.max}` : `0/${parts.ranking.max}`;
  $("scoreForm").textContent = parts.form.available ? `${parts.form.score}/${parts.form.max}` : `0/${parts.form.max}`;
  $("barMarket").style.width = `${parts.market.available ? (parts.market.score/parts.market.max*100) : 0}%`;
  $("barRanking").style.width = `${parts.ranking.available ? (parts.ranking.score/parts.ranking.max*100) : 0}%`;
  $("barForm").style.width = `${parts.form.available ? (parts.form.score/parts.form.max*100) : 0}%`;

  $("detailP1").textContent = `${playerFlag(match.player1,match.tour,match,1)} ${match.player1}`;
  $("detailP2").textContent = `${playerFlag(match.player2,match.tour,match,2)} ${match.player2}`;
  $("detailO1").textContent = odd(match.odds1);
  $("detailO2").textContent = odd(match.odds2);
  $("detailBook1").textContent = match.bookmaker1 || match.book1 || "Quote";
  $("detailBook2").textContent = match.bookmaker2 || match.book2 || "Quote";

  if(r1 && r2){
    const leader = r1 < r2 ? match.player1 : match.player2;
    $("moduleRanking").textContent = `#${r1} / #${r2}`;
    $("moduleRankingText").textContent = `${leader} liegt ${Math.abs(r1-r2)} Plätze vorn`;
  }else{
    $("moduleRanking").textContent = "–";
    $("moduleRankingText").textContent = "Ranking noch nicht vollständig";
  }

  if(f1 && f2){
    const leader = f1.pct === f2.pct ? null : (f1.pct > f2.pct ? match.player1 : match.player2);
    $("moduleForm").textContent = `${f1.pct}% / ${f2.pct}%`;
    $("moduleFormText").textContent = leader ? `${leader} mit Formvorteil` : "Form aktuell ausgeglichen";
  }else{
    $("moduleForm").textContent = "–";
    $("moduleFormText").textContent = "Formquelle noch nicht vollständig";
  }

  // Reserved for the database phase.
  $("moduleH2H").textContent = "–";
  $("moduleSurface").textContent = "–";
  $("moduleServe").textContent = "–";
  $("moduleReturn").textContent = "–";

  $("detailsPanel").scrollIntoView({behavior:"smooth", block:"start"});
}

async function fetchJson(path, fallback){
  try{
    const res = await fetch(`${path}?v=${Date.now()}`, {cache:"no-store"});
    if(!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return await res.json();
  }catch(error){
    console.warn(error);
    return fallback;
  }
}

async function load(){
  $("statusTitle").textContent = "Daten werden geladen";
  $("statusText").textContent = "Mission Control verbindet sich mit deinen JSON-Dateien.";

  const [matchesPayload, rankingsPayload, formsPayload, playersPayload] = await Promise.all([
    fetchJson("./data/matches.json", {matches:[]}),
    fetchJson("./data/rankings.json", {players:[]}),
    fetchJson("./data/form.json", {players:[]}),
    fetchJson("./data/players.json", {players:[]})
  ]);

  STATE.matches = Array.isArray(matchesPayload.matches)
    ? matchesPayload.matches
    : Array.isArray(matchesPayload)
      ? matchesPayload
      : [];

  STATE.rankings =
    (Array.isArray(rankingsPayload.players) && rankingsPayload.players) ||
    (Array.isArray(rankingsPayload.rankings) && rankingsPayload.rankings) ||
    (Array.isArray(rankingsPayload.data) && rankingsPayload.data) ||
    (Array.isArray(rankingsPayload) && rankingsPayload) ||
    [];

  STATE.forms =
    (Array.isArray(formsPayload.players) && formsPayload.players) ||
    (Array.isArray(formsPayload.form) && formsPayload.form) ||
    (Array.isArray(formsPayload.data) && formsPayload.data) ||
    (Array.isArray(formsPayload) && formsPayload) ||
    [];

  STATE.players =
    (Array.isArray(playersPayload.players) && playersPayload.players) ||
    (Array.isArray(playersPayload.data) && playersPayload.data) ||
    (Array.isArray(playersPayload) && playersPayload) ||
    [];

  STATE.activeDate = resolveActiveDate();

  renderStatus(matchesPayload);
  renderStats();
  renderTop();
  renderMatchList();
  renderAllMatches();
  renderWatchlist();
  renderPlayerSearch($("playerSearch")?.value || "");
  renderAI();
}

$("refreshBtn").onclick = load;
$("toggleAllBtn").onclick = () => {
  STATE.showAll = !STATE.showAll;
  renderMatchList();
};
$("closeDetailsBtn").onclick = () => $("detailsPanel").classList.add("hidden");

if($("playerSearch")){
  $("playerSearch").addEventListener("input", event => renderPlayerSearch(event.target.value));
}

document.querySelectorAll(".bottom-nav button[data-view]").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.remove("active"));
    button.classList.add("active");

    document.querySelectorAll(".app-view").forEach(view => view.classList.add("hidden"));

    const view = $(button.dataset.view);
    if(view) view.classList.remove("hidden");

    window.scrollTo({top:0, behavior:"smooth"});
  };
});

load();

// Keep v2 free of service-worker caching while we stabilise the data layer.
if("serviceWorker" in navigator){
  window.addEventListener("load", async () => {
    try{
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.unregister()));
    }catch(error){
      console.warn("Service worker cleanup failed:", error);
    }
  });
}
