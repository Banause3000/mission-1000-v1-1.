// Mission 1000 v2.6.5
// Core refactor: one source of truth, defensive JSON loading, no invented data.

const $ = id => document.getElementById(id);

const STATE = {
  matches: [],
  rankings: [],
  forms: [],
  players: [],
  h2h: [],
  surfaces: [],
  stats: [],
  tournamentSurfaces: [],
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

function nameParts(value){
  return normalizeName(value)
    .replace(/\./g," ")
    .split(" ")
    .filter(Boolean);
}

function surnameKey(value){
  const parts=nameParts(value);
  return parts.at(-1) || "";
}

function firstInitial(value){
  const parts=nameParts(value);
  return parts[0]?.[0] || "";
}

function compactName(value){
  return normalizeName(value).replace(/[^a-z0-9]/g,"");
}

function playerNameMatches(a,b){
  const A=normalizeName(a);
  const B=normalizeName(b);

  if(!A || !B) return false;
  if(A===B) return true;
  if(compactName(A)===compactName(B)) return true;

  const aParts=nameParts(A);
  const bParts=nameParts(B);

  // Handles feeds like "Pegula, Jessica" after punctuation cleanup or
  // shortened names such as "J Pegula" / "Jessica Pegula".
  const sameSurname=surnameKey(A)===surnameKey(B);
  const sameInitial=firstInitial(A)===firstInitial(B);

  if(sameSurname && sameInitial) return true;

  // A reversed "surname firstname" form is also accepted.
  if(aParts.length>=2 && bParts.length>=2){
    const aReverse=[...aParts].reverse().join(" ");
    if(aReverse===B) return true;

    const bReverse=[...bParts].reverse().join(" ");
    if(bReverse===A) return true;
  }

  return false;
}

function findPlayerRecord(list,name,tour){
  if(!Array.isArray(list)) return null;

  const t=String(tour||"").toUpperCase();

  // Pass 1: exact normalized match
  let found=list.find(p=>{
    const pname=p.name ?? p.player ?? p.playerName ?? p.player_name ?? p.fullName ?? p.full_name;
    const ptour=String(p.tour ?? p.type ?? p.league ?? "").toUpperCase();
    return normalizeName(pname)===normalizeName(name) && (!ptour || !t || ptour===t);
  });
  if(found) return found;

  // Pass 2: tolerant player-name matching
  const candidates=list.filter(p=>{
    const pname=p.name ?? p.player ?? p.playerName ?? p.player_name ?? p.fullName ?? p.full_name;
    const ptour=String(p.tour ?? p.type ?? p.league ?? "").toUpperCase();
    return playerNameMatches(pname,name) && (!ptour || !t || ptour===t);
  });

  // Avoid guessing when more than one player could match.
  return candidates.length===1 ? candidates[0] : null;
}


function dayString(date = new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function odd(value){
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "–";
}

function codeToFlag(code){

  const IOC_TO_ISO2 = {
    ARG:"AR", AUS:"AU", AUT:"AT", BEL:"BE", BIH:"BA", BLR:"BY",
    BOL:"BO", BRA:"BR", BUL:"BG", CAN:"CA", CHI:"CL", CHN:"CN",
    COL:"CO", CRO:"HR", CYP:"CY", CZE:"CZ", DEN:"DK", ECU:"EC",
    EGY:"EG", ESP:"ES", EST:"EE", FIN:"FI", FRA:"FR", GBR:"GB",
    GEO:"GE", GER:"DE", GRE:"GR", HUN:"HU", IND:"IN", INA:"ID",
    IRL:"IE", ISR:"IL", ITA:"IT", JPN:"JP", KAZ:"KZ", KOR:"KR",
    LAT:"LV", LTU:"LT", LUX:"LU", MAR:"MA", MDA:"MD", MEX:"MX",
    MON:"MC", NED:"NL", NOR:"NO", NZL:"NZ", PAR:"PY", PER:"PE",
    PHI:"PH", POL:"PL", POR:"PT", ROU:"RO", RSA:"ZA", RUS:"RU",
    SRB:"RS", SLO:"SI", SVK:"SK", SUI:"CH", SWE:"SE", THA:"TH",
    TPE:"TW", TUN:"TN", TUR:"TR", UAE:"AE", UKR:"UA", URU:"UY",
    USA:"US", UZB:"UZ", VEN:"VE", VIE:"VN", ZIM:"ZW"
  };

  let c = String(code || "").trim().toUpperCase();

  if(c.length === 3 && IOC_TO_ISO2[c]){
    c = IOC_TO_ISO2[c];
  }

  if(!/^[A-Z]{2}$/.test(c)){
    return "🎾";
  }

  return String.fromCodePoint(
    ...[...c].map(ch => 127397 + ch.charCodeAt())
  );
}

function playerMeta(name, tour){
  return findPlayerRecord(STATE.players,name,tour);
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
  return extractRank(findPlayerRecord(rankingCandidates(),name,tour));
}

function formCandidates(){
  const src = STATE.forms;
  if(Array.isArray(src)) return src;
  return [];
}

function getForm(name, tour){
  const found = findPlayerRecord(formCandidates(),name,tour);

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


function h2hRecord(match){
  const tour=String(match.tour||"").toUpperCase();

  const matches=STATE.h2h.filter(x=>{
    const p1=x.player1 ?? x.p1 ?? x.a;
    const p2=x.player2 ?? x.p2 ?? x.b;
    const xtour=String(x.tour||"").toUpperCase();

    const direct=
      playerNameMatches(p1,match.player1) &&
      playerNameMatches(p2,match.player2);

    const reverse=
      playerNameMatches(p1,match.player2) &&
      playerNameMatches(p2,match.player1);

    return (direct || reverse) && (!xtour || !tour || xtour===tour);
  });

  if(matches.length!==1) return null;

  const record=matches[0];

  let wins1=Number(record.wins1 ?? record.player1Wins ?? record.p1Wins);
  let wins2=Number(record.wins2 ?? record.player2Wins ?? record.p2Wins);

  if(!Number.isFinite(wins1)||!Number.isFinite(wins2)||(wins1+wins2)<=0){
    return null;
  }

  const storedP1=record.player1 ?? record.p1 ?? record.a;

  if(!playerNameMatches(storedP1,match.player1)){
    [wins1,wins2]=[wins2,wins1];
  }

  return {
    wins1,
    wins2,
    total:wins1+wins2,
    recentMeetings:Array.isArray(record.recentMeetings) ? record.recentMeetings : []
  };
}

function surfaceRecord(name,tour,surface){
  const s=normalizeName(surface||"");
  const item=findPlayerRecord(STATE.surfaces,name,tour);
  if(!item) return null;

  const records=item.surfaces ?? item.surface ?? item.records ?? {};

  let key=null;
  if(s.includes("hard")) key="hard";
  else if(s.includes("clay")||s.includes("sand")) key="clay";
  else if(s.includes("grass")||s.includes("rasen")) key="grass";
  else if(s.includes("indoor")||s.includes("carpet")) key="indoor";
  if(!key) return null;

  const rec=records[key] ?? records[key.toUpperCase()];
  if(!rec) return null;

  const wins=Number(rec.wins ?? rec.w);
  const losses=Number(rec.losses ?? rec.l);
  const total=Number(rec.total ?? (wins+losses));

  if(!Number.isFinite(wins)||!Number.isFinite(losses)||!Number.isFinite(total)||total<=0){
    return null;
  }

  const pctValue=Number(rec.winPct ?? rec.pct);
  const pct=Number.isFinite(pctValue) ? Math.round(pctValue) : Math.round(wins/total*100);

  return {
    wins,
    losses,
    total,
    pct,
    period:rec.period || null
  };
}

function statRecord(name,tour){
  return findPlayerRecord(STATE.stats,name,tour);
}

function numericStat(record,keys){
  if(!record) return null;
  for(const key of keys){
    const n=Number(record[key]);
    if(Number.isFinite(n)) return n;
  }
  return null;
}

async function loadOptionalIntelligence(){

  const [h2hResult, surfaceResult, statsResult, eventSurfaceResult] = await Promise.all([
    fetchBestJson(
      ["./data/intelligence/h2h.json", "./data/sources/h2h.json"],
      {matches:[]}
    ),
    fetchBestJson(
      ["./data/intelligence/surface.json", "./data/sources/surface.json"],
      {players:[]}
    ),
    fetchBestJson(
      ["./data/intelligence/stats.json", "./data/sources/stats.json"],
      {players:[]}
    ),
    fetchBestJson(
      ["./data/intelligence/tournament_surfaces.json", "./data/sources/tournament_surfaces.json"],
      {events:[]}
    )
  ]);

  const h2hPayload = h2hResult.payload;
  const surfacePayload = surfaceResult.payload;
  const statsPayload = statsResult.payload;
  const eventSurfacePayload = eventSurfaceResult.payload;

  STATE.h2h =
    (Array.isArray(h2hPayload.matches) && h2hPayload.matches) ||
    (Array.isArray(h2hPayload.h2h) && h2hPayload.h2h) ||
    (Array.isArray(h2hPayload.data) && h2hPayload.data) ||
    (Array.isArray(h2hPayload) && h2hPayload) ||
    [];

  STATE.surfaces =
    (Array.isArray(surfacePayload.players) && surfacePayload.players) ||
    (Array.isArray(surfacePayload.data) && surfacePayload.data) ||
    (Array.isArray(surfacePayload) && surfacePayload) ||
    [];

  STATE.stats =
    (Array.isArray(statsPayload.players) && statsPayload.players) ||
    (Array.isArray(statsPayload.data) && statsPayload.data) ||
    (Array.isArray(statsPayload) && statsPayload) ||
    [];

  STATE.tournamentSurfaces =
    (Array.isArray(eventSurfacePayload.events) && eventSurfacePayload.events) ||
    (Array.isArray(eventSurfacePayload.data) && eventSurfacePayload.data) ||
    (Array.isArray(eventSurfacePayload) && eventSurfacePayload) ||
    [];

  console.info("Mission 1000 Intelligence v2.6.3", {
    h2h: STATE.h2h.length,
    surfacePlayers: STATE.surfaces.length,
    stats: STATE.stats.length,
    tournamentSurfaces: STATE.tournamentSurfaces.length,
    tournamentSurfacePath: eventSurfaceResult.path
  });
}

function renderOptionalCoverage(){
  const list=currentMatches();

  const h2hCount=list.filter(m=>h2hRecord(m)).length;

  const surfaceCount=list.filter(m=>{
    const surface=inferredSurface(m);
    return surface &&
      surfaceRecord(m.player1,m.tour,surface) &&
      surfaceRecord(m.player2,m.tour,surface);
  }).length;

  const statsCount=list.filter(m=>
    statRecord(m.player1,m.tour) &&
    statRecord(m.player2,m.tour)
  ).length;

  if($("h2hCoverage")) $("h2hCoverage").textContent=list.length?`${Math.round(h2hCount/list.length*100)}%`:"0%";
  if($("surfaceCoverage")) $("surfaceCoverage").textContent=list.length?`${Math.round(surfaceCount/list.length*100)}%`:"0%";
  if($("statsCoverage")) $("statsCoverage").textContent=list.length?`${Math.round(statsCount/list.length*100)}%`:"0%";
  if($("engineStatus")){
    const anyIntel = STATE.h2h.length || STATE.surfaces.length || STATE.stats.length || STATE.rankings.length || STATE.forms.length;
    $("engineStatus").textContent = anyIntel ? "ONLINE" : "READY";
  }
}

function renderOptionalDetails(match){
  const h2h=h2hRecord(match);
  if($("moduleH2H")){
    if(h2h){
      $("moduleH2H").textContent=`${h2h.wins1}:${h2h.wins2}`;
      if($("moduleH2HText")) $("moduleH2HText").textContent=
        h2h.wins1===h2h.wins2 ? "Direkte Duelle ausgeglichen" :
        `${h2h.wins1>h2h.wins2?match.player1:match.player2} mit H2H-Vorteil`;
    }else{
      $("moduleH2H").textContent="–";
      if($("moduleH2HText")) $("moduleH2HText").textContent="Noch keine H2H-Daten";
    }
  }

  const surface=inferredSurface(match);
  const s1=surface ? surfaceRecord(match.player1,match.tour,surface) : null;
  const s2=surface ? surfaceRecord(match.player2,match.tour,surface) : null;

  if($("moduleSurface")){
    if(s1&&s2){
      $("moduleSurface").textContent=`${s1.pct}% / ${s2.pct}%`;
      if($("moduleSurfaceText")) $("moduleSurfaceText").textContent=`${surface}`;
    }else{
      $("moduleSurface").textContent="–";
      if($("moduleSurfaceText")) $("moduleSurfaceText").textContent="Noch keine Belagdaten";
    }
  }

  const st1=statRecord(match.player1,match.tour);
  const st2=statRecord(match.player2,match.tour);

  const hold1=numericStat(st1,["holdPct","hold_pct","hold"]);
  const hold2=numericStat(st2,["holdPct","hold_pct","hold"]);
  const ret1=numericStat(st1,["returnPointsWonPct","return_points_won_pct","returnWon"]);
  const ret2=numericStat(st2,["returnPointsWonPct","return_points_won_pct","returnWon"]);

  if($("moduleServe")){
    $("moduleServe").textContent=hold1!==null&&hold2!==null ? `${hold1}% / ${hold2}%` : "–";
    if($("moduleServeText")) $("moduleServeText").textContent=
      hold1!==null&&hold2!==null ? "Service Hold" : "Noch keine Servicedaten";
  }

  if($("moduleReturn")){
    $("moduleReturn").textContent=ret1!==null&&ret2!==null ? `${ret1}% / ${ret2}%` : "–";
    if($("moduleReturnText")) $("moduleReturnText").textContent=
      ret1!==null&&ret2!==null ? "Return-Punkte" : "Noch keine Returndaten";
  }
}





function clamp(value,min,max){
  return Math.max(min,Math.min(max,value));
}

function sideName(match,side){
  return side===1 ? match.player1 : side===2 ? match.player2 : null;
}

function missionScoreV3(match){
  const marketPart = marketComponent(match);
  const rankingPart = rankingComponent(match);
  const formPart = formComponent(match);

  const h2h = h2hRecord(match);
  const surfaceName = inferredSurface(match);
  const surface1 = surfaceName ? surfaceRecord(match.player1,match.tour,surfaceName) : null;
  const surface2 = surfaceName ? surfaceRecord(match.player2,match.tour,surfaceName) : null;
  const stats1 = statRecord(match.player1,match.tour);
  const stats2 = statRecord(match.player2,match.tour);

  const components = [];

  // Markt: max 25
  if(marketPart.available){
    const mk = market(match);
    const gap = Math.abs(mk.p1-mk.p2);
    const score = clamp(Math.round(10 + gap*0.25),10,25);
    const side = mk.p1===mk.p2 ? 0 : (mk.p1>mk.p2 ? 1 : 2);
    components.push({
      key:"market",
      label:"Markt",
      score,
      max:25,
      side,
      available:true,
      detail:`${mk.p1}% / ${mk.p2}%`
    });
  }else{
    components.push({key:"market",label:"Markt",score:0,max:25,side:0,available:false,detail:"–"});
  }

  // Ranking: max 20
  const r1=getRank(match.player1,match.tour);
  const r2=getRank(match.player2,match.tour);
  if(r1 && r2){
    const diff=Math.abs(r1-r2);
    const score=clamp(Math.round(6 + diff/3),6,20);
    const side=r1===r2 ? 0 : (r1<r2 ? 1 : 2);
    components.push({
      key:"ranking",
      label:"Ranking",
      score,
      max:20,
      side,
      available:true,
      detail:`#${r1} / #${r2}`
    });
  }else{
    components.push({key:"ranking",label:"Ranking",score:0,max:20,side:0,available:false,detail:"–"});
  }

  // Form: max 20
  const f1=getForm(match.player1,match.tour);
  const f2=getForm(match.player2,match.tour);
  if(f1 && f2){
    const diff=Math.abs(f1.pct-f2.pct);
    const score=clamp(Math.round(6 + diff*0.18),6,20);
    const side=f1.pct===f2.pct ? 0 : (f1.pct>f2.pct ? 1 : 2);
    components.push({
      key:"form",
      label:"Form",
      score,
      max:20,
      side,
      available:true,
      detail:`${f1.pct}% / ${f2.pct}%`
    });
  }else{
    components.push({key:"form",label:"Form",score:0,max:20,side:0,available:false,detail:"–"});
  }

  // H2H: max 10
  if(h2h){
    const share1=h2h.wins1/h2h.total;
    const share2=h2h.wins2/h2h.total;
    const diff=Math.abs(share1-share2);
    const score=clamp(Math.round(3 + diff*10),3,10);
    const side=h2h.wins1===h2h.wins2 ? 0 : (h2h.wins1>h2h.wins2 ? 1 : 2);
    components.push({
      key:"h2h",
      label:"H2H",
      score,
      max:10,
      side,
      available:true,
      detail:`${h2h.wins1}:${h2h.wins2}`
    });
  }else{
    components.push({key:"h2h",label:"H2H",score:0,max:10,side:0,available:false,detail:"–"});
  }

  // Belag: max 10
  if(surface1 && surface2){
    const diff=Math.abs(surface1.pct-surface2.pct);
    const score=clamp(Math.round(3 + diff*0.12),3,10);
    const side=surface1.pct===surface2.pct ? 0 : (surface1.pct>surface2.pct ? 1 : 2);
    components.push({
      key:"surface",
      label:"Belag",
      score,
      max:10,
      side,
      available:true,
      detail:`${surface1.pct}% / ${surface2.pct}%`
    });
  }else{
    components.push({key:"surface",label:"Belag",score:0,max:10,side:0,available:false,detail:"–"});
  }

  // Stats: max 15
  const statKeys = [
    ["holdPct","hold_pct","hold"],
    ["breakPct","break_pct","break"],
    ["firstServeWonPct","first_serve_won_pct","firstServeWon"],
    ["returnPointsWonPct","return_points_won_pct","returnWon"]
  ];

  if(stats1 && stats2){
    let p1wins=0,p2wins=0,diffs=[];
    for(const aliases of statKeys){
      const a=numericStat(stats1,aliases);
      const b=numericStat(stats2,aliases);
      if(a===null || b===null) continue;
      diffs.push(Math.abs(a-b));
      if(a>b) p1wins++;
      else if(b>a) p2wins++;
    }

    if(diffs.length){
      const avg=diffs.reduce((s,x)=>s+x,0)/diffs.length;
      const score=clamp(Math.round(5 + avg*0.7),5,15);
      const side=p1wins===p2wins ? 0 : (p1wins>p2wins ? 1 : 2);
      components.push({
        key:"stats",
        label:"Stats",
        score,
        max:15,
        side,
        available:true,
        detail:`${diffs.length} Werte`
      });
    }else{
      components.push({key:"stats",label:"Stats",score:0,max:15,side:0,available:false,detail:"–"});
    }
  }else{
    components.push({key:"stats",label:"Stats",score:0,max:15,side:0,available:false,detail:"–"});
  }

  const available=components.filter(c=>c.available);
  const availableMax=available.reduce((s,c)=>s+c.max,0);
  const evidence=Math.round(availableMax/100*100);

  // Determine consensus direction and punish contradictions.
  let support1=0,support2=0;
  for(const c of available){
    if(c.side===1) support1 += c.score;
    if(c.side===2) support2 += c.score;
  }

  const winnerSide = support1===support2 ? 0 : (support1>support2 ? 1 : 2);
  const supporting = available.filter(c=>c.side===winnerSide && winnerSide!==0);
  const opposing = available.filter(c=>c.side!==0 && c.side!==winnerSide);

  const supportScore=supporting.reduce((s,c)=>s+c.score,0);
  const opposeScore=opposing.reduce((s,c)=>s+c.score,0);
  const directional=Math.max(0,supportScore-opposeScore);

  // Confidence depends on evidence + agreement, not just odds.
  const agreementDen=supportScore+opposeScore;
  const agreement=agreementDen ? supportScore/agreementDen : .5;
  const confidence=clamp(Math.round(45 + evidence*0.35 + agreement*20),45,97);

  // Score reflects evidence depth and directional strength.
  // Market-only can no longer generate 90+.
  const score=clamp(
    Math.round(45 + evidence*0.25 + directional*0.35 + agreement*10),
    45,
    97
  );

  return {
    score,
    confidence,
    evidence,
    winnerSide,
    winnerName:sideName(match,winnerSide),
    components
  };
}

function missionScore(match){
  return missionScoreV3(match).score;
}

function confidence(match){
  return missionScoreV3(match).confidence;
}

function evidenceLabel(value){
  if(value>=85) return "Sehr hohe Datentiefe";
  if(value>=65) return "Hohe Datentiefe";
  if(value>=45) return "Mittlere Datentiefe";
  if(value>=25) return "Niedrige Datentiefe";
  return "Sehr niedrige Datentiefe";
}

function componentByKey(report,key){
  return report.components.find(c=>c.key===key) || null;
}

function scoreLabel(score){
  if(score >= 86) return "Sehr interessantes Match";
  if(score >= 72) return "Interessantes Match";
  if(score >= 60) return "Beobachten";
  return "Standard";
}


function normalizeEvent(value){
  let event=normalizeName(value)
    .replace(/\b20\d{2}\b/g," ")
    .replace(/\batp\b/g," ")
    .replace(/\bwta\b/g," ")
    .replace(/\bmasters\b/g," ")
    .replace(/\b1000\b/g," ")
    .replace(/\b500\b/g," ")
    .replace(/\b250\b/g," ")
    .replace(/\bmen singles\b/g," ")
    .replace(/\bwomen singles\b/g," ")
    .replace(/\bsingles\b/g," ")
    .replace(/\bpresented by rogers\b/g," ")
    .replace(/\bcanada\b/g," ")
    .replace(/\bcanadian open\b/g," canadian open ")
    .replace(/\bnational bank open\b/g," canadian open ")
    .replace(/\brogers cup\b/g," canadian open ")
    .replace(/\btoronto\b/g," canadian open ")
    .replace(/\bmontreal\b/g," canadian open ")
    .replace(/\s+/g," ")
    .trim();

  return event;
}

function eventTokens(value){
  return normalizeEvent(value)
    .split(" ")
    .filter(token=>token.length>2);
}

function eventSimilarity(a,b){
  const A=new Set(eventTokens(a));
  const B=new Set(eventTokens(b));

  if(!A.size || !B.size) return 0;

  let shared=0;
  for(const token of A){
    if(B.has(token)) shared++;
  }

  return shared/Math.max(A.size,B.size);
}

function inferredSurface(match){
  const direct=match.surface ?? match.court ?? match.surfaceType ?? "";
  if(direct) return direct;

  const tour=String(match.tour||"").toUpperCase();
  const target=normalizeEvent(match.event||"");

  if(!target) return "";

  const candidates=STATE.tournamentSurfaces
    .filter(item=>{
      const itemTour=String(item.tour||"").toUpperCase();
      return !itemTour || !tour || itemTour===tour;
    })
    .map(item=>({
      item,
      normalized:normalizeEvent(item.normalizedEvent ?? item.event ?? ""),
      similarity:eventSimilarity(target,item.normalizedEvent ?? item.event ?? "")
    }));

  // Exact normalized event is always preferred.
  const exact=candidates.find(x=>x.normalized===target);
  if(exact) return exact.item.surface||"";

  // Otherwise use a strong token match only.
  const best=[...candidates].sort((a,b)=>b.similarity-a.similarity)[0];
  if(best && best.similarity>=0.66){
    return best.item.surface||"";
  }

  return "";
}

function matchStartMs(match){
  if(match.startIso){
    const ms = Date.parse(match.startIso);
    if(Number.isFinite(ms)) return ms;
  }

  if(match.date && match.start){
    const ms = Date.parse(`${match.date}T${match.start}:00`);
    if(Number.isFinite(ms)) return ms;
  }

  return null;
}

function statusKey(match){
  return String(match.status || "").trim().toLowerCase();
}

function isConfirmedEnded(match){
  const status=statusKey(match);
  return [
    "finished","completed","complete","ended",
    "cancelled","canceled","retired","walkover"
  ].includes(status);
}

function isConfirmedLive(match){
  const status=statusKey(match);
  return [
    "live","inplay","in-play","in_progress","in-progress",
    "live-or-started","started"
  ].includes(status);
}

function isVisibleMatch(match){
  if(isConfirmedEnded(match)) return false;

  // If our feed explicitly knows it is live, we keep it out of the pre-match app.
  if(isConfirmedLive(match)) return false;

  const start=matchStartMs(match);

  // Scheduled tennis starts move all the time. Do NOT delete a match merely
  // because the original clock time has passed. Keep it accessible for up to
  // 4 hours so delayed matches can still be opened and analysed.
  if(start!==null && Date.now()>start + 4*60*60*1000){
    return false;
  }

  return true;
}

function isRecommendationEligible(match){
  if(!isVisibleMatch(match)) return false;

  const start=matchStartMs(match);

  // Recommendations are stricter than visibility:
  // once the scheduled start has passed, the match can still be opened in
  // Matches, but it is no longer promoted as Top Match / Mission AI.
  if(start!==null && Date.now()>start + 5*60*1000){
    return false;
  }

  return true;
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
    m.player2 &&
    isVisibleMatch(m)
  );
}

function recommendationMatches(){
  return currentMatches().filter(isRecommendationEligible);
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
  return [...recommendationMatches()]
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

  const report = missionScoreV3(match);
  const score = report.score;
  const conf = report.confidence;
  const mk = market(match);

  $("topScore").textContent = score;
  setRing($("topScore").parentElement, score);

  $("topConfidence").textContent = `${conf}%`;
  $("confidenceBar").style.width = `${conf}%`;
  $("confidenceLabel").textContent = conf >= 88 ? "SEHR HOCH" : conf >= 76 ? "HOCH" : "SOLIDE";

  if(report.winnerName){
    $("marketTrend").textContent = `${report.winnerName} · ${report.evidence}% Daten`;
  }else if(mk){
    const fav = mk.p1 >= mk.p2 ? match.player1 : match.player2;
    $("marketTrend").textContent = `${fav} ↗ ${Math.max(mk.p1,mk.p2)}%`;
  }else{
    $("marketTrend").textContent = "Analyse noch offen";
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

  const startMs=matchStartMs(match);
  const delayedButVisible=
    startMs!==null &&
    Date.now()>startMs + 5*60*1000 &&
    !isConfirmedLive(match) &&
    !isConfirmedEnded(match);

  el.innerHTML = `
    <div class="time">
      ${match.start || "–"}
      <small>${delayedButVisible ? "START OFFEN" : (isConfirmedLive(match) ? "LIVE" : dataDateLabel())}</small>
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

  let list = [...recommendationMatches()]
    .sort((a,b) => missionScore(b) - missionScore(a));

  if(!STATE.showAll) list = list.slice(0,6);

  $("listTitle").textContent = STATE.activeDate === dayString()
    ? "Wichtige Matches"
    : "Neuester Spieltag";

  if(!list.length){
    const visible=currentMatches().length;
    wrap.innerHTML = visible
      ? '<div class="empty">Keine neuen Pre-Match-Empfehlungen. Weitere heutige Matches findest du im MATCHES-Tab.</div>'
      : '<div class="empty">Keine Matches verfügbar.</div>';
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
  const box=$("aiReport");
  if(!box) return;

  const match=topMatch();
  if(!match){
    box.textContent="Noch kein Match für einen Mission Report verfügbar.";
    return;
  }

  const report=missionScoreV3(match);
  const r1=getRank(match.player1,match.tour);
  const r2=getRank(match.player2,match.tour);
  const f1=getForm(match.player1,match.tour);
  const f2=getForm(match.player2,match.tour);
  const mk=market(match);

  $("aiScore").textContent=report.score;
  setRing($("aiScore").parentElement,report.score);
  $("aiMatchTitle").textContent=`${match.player1} vs. ${match.player2}`;
  $("aiMatchMeta").textContent=`${match.tour||""} · ${match.event||"Turnier"} · ${match.start||"–"}`;
  $("aiMarket").textContent=mk?`${mk.p1}% / ${mk.p2}%`:"–";
  $("aiRanking").textContent=r1&&r2?`${r1} / ${r2}`:"–";
  $("aiForm").textContent=f1&&f2?`${f1.pct}% / ${f2.pct}%`:"–";
  $("aiConfidence").textContent=`${report.confidence}%`;

  const parts=[];
  parts.push(`${playerFlag(match.player1,match.tour,match,1)} ${match.player1} trifft auf ${playerFlag(match.player2,match.tour,match,2)} ${match.player2}.`);

  if(report.winnerName){
    parts.push(`Die aktuelle Datenlage spricht insgesamt eher für ${report.winnerName}.`);
  }else{
    parts.push("Die verfügbaren Faktoren ergeben aktuell keinen klaren Gesamtsieger.");
  }

  const strongest=[...report.components]
    .filter(c=>c.available && c.side!==0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,3);

  if(strongest.length){
    parts.push(`Stärkste Faktoren: ${strongest.map(c=>`${c.label} ${c.score}/${c.max}`).join(", ")}.`);
  }

  parts.push(`${evidenceLabel(report.evidence)} (${report.evidence} %). Mission Score ${report.score}/100, Confidence ${report.confidence} %.`);
  box.textContent=parts.join(" ");
}

function showDetails(match){
  const report=missionScoreV3(match);
  const score=report.score;
  const mk=market(match);
  const r1=getRank(match.player1,match.tour);
  const r2=getRank(match.player2,match.tour);
  const f1=getForm(match.player1,match.tour);
  const f2=getForm(match.player2,match.tour);

  $("detailsPanel").classList.remove("hidden");
  $("detailTitle").textContent=`${match.player1} vs. ${match.player2}`;
  $("detailScore").textContent=score;
  setRing($("detailScore").parentElement,score);

  $("detailSignal").textContent=report.winnerName
    ? `${scoreLabel(score)} · ${report.winnerName}`
    : scoreLabel(score);

  let narrative=report.winnerName
    ? `Die Gesamtdaten sprechen aktuell eher für ${report.winnerName}.`
    : "Die verfügbaren Faktoren sind aktuell weitgehend ausgeglichen.";

  narrative += ` ${evidenceLabel(report.evidence)} mit ${report.evidence} % Datenabdeckung.`;
  $("detailNarrative").textContent=narrative;

  $("factorMarket").textContent=mk?`${mk.p1}% / ${mk.p2}%`:"–";
  $("factorRanking").textContent=r1&&r2?`${r1} / ${r2}`:"–";
  $("factorForm").textContent=f1&&f2?`${f1.pct}% / ${f2.pct}%`:"–";
  $("factorConfidence").textContent=`${report.confidence}%`;

  const map=[
    ["market","scoreMarket","barMarket"],
    ["ranking","scoreRanking","barRanking"],
    ["form","scoreForm","barForm"]
  ];

  for(const [key,scoreId,barId] of map){
    const c=componentByKey(report,key);
    if(!c) continue;
    $(scoreId).textContent=c.available ? `${c.score}/${c.max}` : `0/${c.max}`;
    $(barId).style.width=c.available ? `${c.score/c.max*100}%` : "0%";
  }

  $("detailP1").textContent=`${playerFlag(match.player1,match.tour,match,1)} ${match.player1}`;
  $("detailP2").textContent=`${playerFlag(match.player2,match.tour,match,2)} ${match.player2}`;
  $("detailO1").textContent=odd(match.odds1);
  $("detailO2").textContent=odd(match.odds2);
  $("detailBook1").textContent=match.bookmaker1||match.book1||"Quote";
  $("detailBook2").textContent=match.bookmaker2||match.book2||"Quote";

  if(r1&&r2){
    $("moduleRanking").textContent=`#${r1} / #${r2}`;
    $("moduleRankingText").textContent=`${r1<r2?match.player1:match.player2} liegt ${Math.abs(r1-r2)} Plätze vorn`;
  }else{
    $("moduleRanking").textContent="–";
    $("moduleRankingText").textContent="Ranking noch nicht vollständig";
  }

  if(f1&&f2){
    $("moduleForm").textContent=`${f1.pct}% / ${f2.pct}%`;
    $("moduleFormText").textContent=f1.pct===f2.pct
      ? "Form aktuell ausgeglichen"
      : `${f1.pct>f2.pct?match.player1:match.player2} mit Formvorteil`;
  }else{
    $("moduleForm").textContent="–";
    $("moduleFormText").textContent="Form noch nicht vollständig";
  }

  renderOptionalDetails(match);

  // Upgrade H2H/Surface/Stats text with Mission Score component strength.
  const h2hC=componentByKey(report,"h2h");
  const surfC=componentByKey(report,"surface");
  const statsC=componentByKey(report,"stats");

  if(h2hC?.available && $("moduleH2HText")){
    $("moduleH2HText").textContent += ` · Score ${h2hC.score}/${h2hC.max}`;
  }
  if(surfC?.available && $("moduleSurfaceText")){
    $("moduleSurfaceText").textContent += ` · Score ${surfC.score}/${surfC.max}`;
  }
  if(statsC?.available){
    if($("moduleServeText")) $("moduleServeText").textContent += ` · Stats ${statsC.score}/${statsC.max}`;
  }

  $("detailsPanel").scrollIntoView({behavior:"smooth",block:"start"});
}

async function fetchJson(path, fallback, timeoutMs=10000){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try{
    const res = await fetch(`${path}?v=${Date.now()}`, {
      cache:"no-store",
      signal:controller.signal
    });

    if(!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return await res.json();
  }catch(error){
    console.warn(`Mission 1000 fetch failed: ${path}`, error);
    return fallback;
  }finally{
    clearTimeout(timer);
  }
}

function payloadCount(payload){
  if(Array.isArray(payload)) return payload.length;
  if(!payload || typeof payload !== "object") return 0;

  for(const key of ["matches","players","rankings","form","h2h","events","data"]){
    if(Array.isArray(payload[key])) return payload[key].length;
  }

  return 0;
}

async function fetchBestJson(paths, fallback){
  let bestPayload = fallback;
  let bestCount = payloadCount(fallback);
  let bestPath = null;

  for(const path of paths){
    const payload = await fetchJson(path, fallback);
    const count = payloadCount(payload);

    if(count > bestCount){
      bestPayload = payload;
      bestCount = count;
      bestPath = path;
    }

    if(count > 0){
      console.info(`Mission 1000: ${path} -> ${count} Datensätze`);
      return {payload, path, count};
    }
  }

  console.warn("Mission 1000: keine gefüllte Quelle gefunden", paths);
  return {payload:bestPayload, path:bestPath, count:bestCount};
}

function renderEverything(matchesPayload){
  STATE.activeDate = resolveActiveDate();
  renderStatus(matchesPayload || {});
  renderStats();
  renderTop();
  renderMatchList();
  renderAllMatches();
  renderWatchlist();
  renderPlayerSearch($("playerSearch")?.value || "");
  renderAI();
  renderOptionalCoverage();
}

async function load(){

  $("statusTitle").textContent = "Matches werden geladen";
  $("statusText").textContent = "Mission Control lädt zuerst den aktuellen Spieltag.";

  const matchesResult = await fetchBestJson(
    ["./data/matches.json"],
    {matches:[]}
  );

  const matchesPayload = matchesResult.payload;

  STATE.matches =
    (Array.isArray(matchesPayload.matches) && matchesPayload.matches) ||
    (Array.isArray(matchesPayload) && matchesPayload) ||
    [];

  renderEverything(matchesPayload);

  if(!STATE.matches.length){
    $("statusTitle").textContent = "Keine Matchdaten gefunden";
    $("statusText").textContent = "data/matches.json enthält aktuell keine verwertbaren Matches.";
    return;
  }

  $("statusTitle").textContent = "Intelligence wird geladen";
  $("statusText").textContent = "Ranking, Form und Spielerprofile werden ergänzt.";

  const [rankingResult, formResult] = await Promise.all([
    fetchBestJson(
      ["./data/rankings.json", "./data/sources/rankings.json"],
      {players:[]}
    ),
    fetchBestJson(
      ["./data/form.json", "./data/sources/form.json"],
      {players:[]}
    )
  ]);

  const rankingsPayload = rankingResult.payload;
  const formsPayload = formResult.payload;

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

  console.info("Mission 1000 Core Intelligence", {
    rankings: STATE.rankings.length,
    form: STATE.forms.length,
    rankingPath: rankingResult.path,
    formPath: formResult.path
  });

  // Show ranking/form immediately. Never wait for the very large players.json.
  renderEverything(matchesPayload);

  // Player metadata/flags load in the background and cannot block analysis.
  fetchBestJson(
    ["./data/players.json", "./data/sources/players.json"],
    {players:[]}
  ).then(playersResult => {
    const playersPayload = playersResult.payload;

    STATE.players =
      (Array.isArray(playersPayload.players) && playersPayload.players) ||
      (Array.isArray(playersPayload.data) && playersPayload.data) ||
      (Array.isArray(playersPayload) && playersPayload) ||
      [];

    console.info("Mission 1000 Player Metadata", {
      players: STATE.players.length,
      path: playersResult.path
    });

    // Flags/player search may improve after background metadata arrives.
    renderMatchList();
    renderAllMatches();
    renderWatchlist();
    renderPlayerSearch($("playerSearch")?.value || "");
  }).catch(error => console.warn("Player metadata background load failed", error));

  $("statusTitle").textContent = "Analyse-Daten werden geladen";
  $("statusText").textContent = "H2H, Belag sowie Serve- und Return-Daten werden ergänzt.";

  await loadOptionalIntelligence();

  renderEverything(matchesPayload);

  const loaded = [
    STATE.rankings.length ? "Ranking" : null,
    STATE.forms.length ? "Form" : null,
    STATE.h2h.length ? "H2H" : null,
    STATE.surfaces.length ? "Belag" : null,
    STATE.stats.length ? "Stats" : null
  ].filter(Boolean);

  $("statusTitle").textContent = "Mission Control online";
  $("statusText").textContent = loaded.length
    ? `Geladen: ${loaded.join(", ")}.`
    : "Matches sind geladen, Intelligence-Daten fehlen aktuell.";

  if($("engineStatus")){
    $("engineStatus").textContent = loaded.length >= 4 ? "ONLINE" : "PARTIAL";
  }
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

console.info("Mission 1000 v2.6.5 Fast Loader Fix aktiv");
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
