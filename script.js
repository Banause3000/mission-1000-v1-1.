// Mission 1000 v2.5.2
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

  if(!/^[A-Z]{2}$/.test(c)){
    return "🎾";
  }

  return String.fromCodePoint(
    ...[...c].map(ch => 127397 + ch.charCodeAt())
  );
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
    ? [
        match.player1Country,
        match.country1,
        match.player1_country,
        match.homeCountry,
        match.home_country
      ]
    : [
        match.player2Country,
        match.country2,
        match.player2_country,
        match.awayCountry,
        match.away_country
      ];

  return fields.find(Boolean) || "";
}

function playerFlag(name, tour, match = null, side = 1){

  const meta = playerMeta(name, tour);

  if(meta?.country){
    return codeToFlag(meta.country);
  }

  const direct = match
    ? directCountry(match, side)
    : "";

  if(direct){
    return codeToFlag(direct);
  }

  return "🎾";
}


// =====================================================
// RANKING
// =====================================================

function rankingCandidates(){

  const src = STATE.rankings;

  if(Array.isArray(src)){
    return src;
  }

  return [];
}

function extractRank(item){

  if(!item || typeof item !== "object"){
    return null;
  }

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

  return Number.isFinite(n) && n > 0
    ? n
    : null;
}

function getRank(name, tour){

  const n = normalizeName(name);
  const t = String(tour || "").toUpperCase();

  const found = rankingCandidates().find(p => {

    const pname =
      p.name ??
      p.player ??
      p.playerName ??
      p.player_name ??
      p.fullName ??
      p.full_name;

    const ptour = String(
      p.tour ??
      p.type ??
      p.league ??
      ""
    ).toUpperCase();

    return (
      normalizeName(pname) === n &&
      (!ptour || !t || ptour === t)
    );
  });

  return extractRank(found);
}


// =====================================================
// FORM
// =====================================================

function formCandidates(){

  const src = STATE.forms;

  if(Array.isArray(src)){
    return src;
  }

  return [];
}

function getForm(name, tour){

  const n = normalizeName(name);
  const t = String(tour || "").toUpperCase();

  const found = formCandidates().find(p => {

    const pname =
      p.name ??
      p.player ??
      p.playerName ??
      p.player_name ??
      p.fullName ??
      p.full_name;

    const ptour = String(
      p.tour ??
      p.type ??
      p.league ??
      ""
    ).toUpperCase();

    return (
      normalizeName(pname) === n &&
      (!ptour || !t || ptour === t)
    );
  });

  if(!found){
    return null;
  }

  const list =
    (Array.isArray(found.lastMatches) && found.lastMatches) ||
    (Array.isArray(found.matches) && found.matches) ||
    (Array.isArray(found.form) && found.form) ||
    [];

  if(list.length){

    const last = list.slice(0, 5);

    const wins = last.filter(m => {

      if(typeof m === "string"){
        return m
          .trim()
          .toUpperCase()
          .startsWith("W");
      }

      return String(
        m.result ??
        m.outcome ??
        m.wl ??
        ""
      ).toUpperCase() === "W";

    }).length;

    return {
      wins,
      total: last.length,
      pct: Math.round(
        (wins / last.length) * 100
      )
    };
  }

  const wins = Number(
    found.wins ??
    found.last5Wins ??
    found.formWins
  );

  const total = Number(
    found.total ??
    found.last5Total ??
    found.formTotal ??
    5
  );

  if(
    Number.isFinite(wins) &&
    Number.isFinite(total) &&
    total > 0
  ){
    return {
      wins,
      total,
      pct: Math.round(
        (wins / total) * 100
      )
    };
  }

  return null;
}


// =====================================================
// MARKT
// =====================================================

function market(match){

  const a = Number(match.odds1);
  const b = Number(match.odds2);

  if(
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    a <= 1 ||
    b <= 1
  ){
    return null;
  }

  const x = 1 / a;
  const y = 1 / b;

  const total = x + y;

  return {
    p1: Math.round(
      (x / total) * 100
    ),

    p2: Math.round(
      (y / total) * 100
    ),

    overround: total
  };
}

function marketComponent(match){

  const mk = market(match);

  if(!mk){
    return {
      score: 0,
      max: 30,
      available: false
    };
  }

  const gap = Math.abs(
    mk.p1 - mk.p2
  );

  const score = Math.max(
    8,
    Math.min(
      30,
      Math.round(
        30 - gap * 0.18
      )
    )
  );

  return {
    score,
    max: 30,
    available: true
  };
}

function rankingComponent(match){

  const r1 = getRank(
    match.player1,
    match.tour
  );

  const r2 = getRank(
    match.player2,
    match.tour
  );

  if(!r1 || !r2){
    return {
      score: 0,
      max: 20,
      available: false
    };
  }

  const diff = Math.abs(
    r1 - r2
  );

  const score = Math.min(
    20,
    Math.max(
      4,
      Math.round(
        4 + diff / 4
      )
    )
  );

  return {
    score,
    max: 20,
    available: true,
    r1,
    r2,
    diff
  };
}

function formComponent(match){

  const f1 = getForm(
    match.player1,
    match.tour
  );

  const f2 = getForm(
    match.player2,
    match.tour
  );

  if(!f1 || !f2){
    return {
      score: 0,
      max: 20,
      available: false
    };
  }

  const diff = Math.abs(
    f1.pct - f2.pct
  );

  const score = Math.min(
    20,
    Math.max(
      5,
      Math.round(
        5 + diff / 5
      )
    )
  );

  return {
    score,
    max: 20,
    available: true,
    f1,
    f2,
    diff
  };
}

function scoreComponents(match){

  return {
    market: marketComponent(match),
    ranking: rankingComponent(match),
    form: formComponent(match)
  };
}


// =====================================================
// H2H
// =====================================================

function h2hRecord(match){

  const a = normalizeName(
    match.player1
  );

  const b = normalizeName(
    match.player2
  );

  const tour = String(
    match.tour || ""
  ).toUpperCase();

  const record = STATE.h2h.find(x => {

    const p1 = normalizeName(
      x.player1 ??
      x.p1 ??
      x.a
    );

    const p2 = normalizeName(
      x.player2 ??
      x.p2 ??
      x.b
    );

    const xtour = String(
      x.tour || ""
    ).toUpperCase();

    return (
      (
        (p1 === a && p2 === b) ||
        (p1 === b && p2 === a)
      )
      &&
      (
        !xtour ||
        !tour ||
        xtour === tour
      )
    );
  });

  if(!record){
    return null;
  }

  let wins1 = Number(
    record.wins1 ??
    record.player1Wins ??
    record.p1Wins
  );

  let wins2 = Number(
    record.wins2 ??
    record.player2Wins ??
    record.p2Wins
  );

  if(
    !Number.isFinite(wins1) ||
    !Number.isFinite(wins2) ||
    (wins1 + wins2) <= 0
  ){
    return null;
  }

  const storedP1 = normalizeName(
    record.player1 ??
    record.p1 ??
    record.a
  );

  if(
    storedP1 &&
    storedP1 !== a
  ){
    [wins1, wins2] = [
      wins2,
      wins1
    ];
  }

  return {
    wins1,
    wins2,
    total: wins1 + wins2
  };
}// =====================================================
// SURFACE
// =====================================================

function surfaceRecord(name, tour, surface){

  const n = normalizeName(name);
  const t = String(tour || "").toUpperCase();
  const s = normalizeName(surface || "");

  const item = STATE.surfaces.find(x => {

    const pname = normalizeName(
      x.name ??
      x.player ??
      x.playerName ??
      x.player_name
    );

    const ptour = String(
      x.tour || ""
    ).toUpperCase();

    return (
      pname === n &&
      (!ptour || !t || ptour === t)
    );
  });

  if(!item){
    return null;
  }

  const records =
    item.surfaces ??
    item.surface ??
    item.records ??
    {};

  let key = null;

  if(s.includes("hard")){
    key = "hard";
  }
  else if(
    s.includes("clay") ||
    s.includes("sand")
  ){
    key = "clay";
  }
  else if(
    s.includes("grass") ||
    s.includes("rasen")
  ){
    key = "grass";
  }
  else if(
    s.includes("indoor")
  ){
    key = "indoor";
  }

  if(!key){
    return null;
  }

  const rec =
    records[key] ??
    records[key.toUpperCase()];

  if(!rec){
    return null;
  }

  const wins = Number(
    rec.wins ??
    rec.w
  );

  const losses = Number(
    rec.losses ??
    rec.l
  );

  const total = wins + losses;

  if(
    !Number.isFinite(wins) ||
    !Number.isFinite(losses) ||
    total <= 0
  ){
    return null;
  }

  return {
    wins,
    losses,
    total,
    pct: Math.round(
      (wins / total) * 100
    )
  };
}


// =====================================================
// STATS
// =====================================================

function statRecord(name, tour){

  const n = normalizeName(name);
  const t = String(tour || "").toUpperCase();

  return STATE.stats.find(x => {

    const pname = normalizeName(
      x.name ??
      x.player ??
      x.playerName ??
      x.player_name
    );

    const ptour = String(
      x.tour || ""
    ).toUpperCase();

    return (
      pname === n &&
      (!ptour || !t || ptour === t)
    );

  }) || null;
}

function numericStat(record, keys){

  if(!record){
    return null;
  }

  for(const key of keys){

    const n = Number(
      record[key]
    );

    if(Number.isFinite(n)){
      return n;
    }
  }

  return null;
}


// =====================================================
// OPTIONAL INTELLIGENCE
// =====================================================

async function loadOptionalIntelligence(){

  const defs = [
    [
      "h2h",
      "./data/intelligence/h2h.json",
      {matches:[]}
    ],
    [
      "surfaces",
      "./data/intelligence/surface.json",
      {players:[]}
    ],
    [
      "stats",
      "./data/intelligence/stats.json",
      {players:[]}
    ]
  ];

  const results = await Promise.allSettled(
    defs.map(
      ([,path,fallback]) =>
        fetchJson(path, fallback)
    )
  );

  results.forEach(
    (result, index) => {

      const [
        key,
        ,
        fallback
      ] = defs[index];

      const payload =
        result.status === "fulfilled"
          ? result.value
          : fallback;

      if(key === "h2h"){

        STATE.h2h =
          (
            Array.isArray(payload.matches)
            &&
            payload.matches
          )
          ||
          (
            Array.isArray(payload.h2h)
            &&
            payload.h2h
          )
          ||
          (
            Array.isArray(payload)
            &&
            payload
          )
          ||
          [];

      }else{

        STATE[key] =
          (
            Array.isArray(payload.players)
            &&
            payload.players
          )
          ||
          (
            Array.isArray(payload.data)
            &&
            payload.data
          )
          ||
          (
            Array.isArray(payload)
            &&
            payload
          )
          ||
          [];
      }

    }
  );
}

function renderOptionalCoverage(){

  const list = currentMatches();

  const h2hCount =
    list.filter(
      m => h2hRecord(m)
    ).length;

  const surfaceCount =
    list.filter(m => {

      const surface =
        m.surface ??
        m.court ??
        m.surfaceType ??
        "";

      return (
        surface
        &&
        surfaceRecord(
          m.player1,
          m.tour,
          surface
        )
        &&
        surfaceRecord(
          m.player2,
          m.tour,
          surface
        )
      );

    }).length;

  const statsCount =
    list.filter(
      m =>
        statRecord(
          m.player1,
          m.tour
        )
        &&
        statRecord(
          m.player2,
          m.tour
        )
    ).length;

  if($("h2hCoverage")){
    $("h2hCoverage").textContent =
      list.length
        ? `${Math.round(
            h2hCount /
            list.length *
            100
          )}%`
        : "0%";
  }

  if($("surfaceCoverage")){
    $("surfaceCoverage").textContent =
      list.length
        ? `${Math.round(
            surfaceCount /
            list.length *
            100
          )}%`
        : "0%";
  }

  if($("statsCoverage")){
    $("statsCoverage").textContent =
      list.length
        ? `${Math.round(
            statsCount /
            list.length *
            100
          )}%`
        : "0%";
  }

  if($("engineStatus")){

    const anyIntel =
      STATE.h2h.length ||
      STATE.surfaces.length ||
      STATE.stats.length ||
      STATE.rankings.length ||
      STATE.forms.length;

    $("engineStatus").textContent =
      anyIntel
        ? "ONLINE"
        : "READY";
  }
}

function renderOptionalDetails(match){

  const h2h = h2hRecord(match);

  if($("moduleH2H")){

    if(h2h){

      $("moduleH2H").textContent =
        `${h2h.wins1}:${h2h.wins2}`;

      if($("moduleH2HText")){

        $("moduleH2HText").textContent =
          h2h.wins1 === h2h.wins2
            ? "Direkte Duelle ausgeglichen"
            : `${
                h2h.wins1 > h2h.wins2
                  ? match.player1
                  : match.player2
              } mit H2H-Vorteil`;
      }

    }else{

      $("moduleH2H").textContent =
        "–";

      if($("moduleH2HText")){
        $("moduleH2HText").textContent =
          "Noch keine H2H-Daten";
      }
    }
  }


  const surface =
    match.surface ??
    match.court ??
    match.surfaceType ??
    "";

  const s1 =
    surface
      ? surfaceRecord(
          match.player1,
          match.tour,
          surface
        )
      : null;

  const s2 =
    surface
      ? surfaceRecord(
          match.player2,
          match.tour,
          surface
        )
      : null;

  if($("moduleSurface")){

    if(s1 && s2){

      $("moduleSurface").textContent =
        `${s1.pct}% / ${s2.pct}%`;

      if($("moduleSurfaceText")){
        $("moduleSurfaceText").textContent =
          `${surface}`;
      }

    }else{

      $("moduleSurface").textContent =
        "–";

      if($("moduleSurfaceText")){
        $("moduleSurfaceText").textContent =
          "Noch keine Belagdaten";
      }
    }
  }


  const st1 = statRecord(
    match.player1,
    match.tour
  );

  const st2 = statRecord(
    match.player2,
    match.tour
  );

  const hold1 =
    numericStat(
      st1,
      [
        "holdPct",
        "hold_pct",
        "hold"
      ]
    );

  const hold2 =
    numericStat(
      st2,
      [
        "holdPct",
        "hold_pct",
        "hold"
      ]
    );

  const ret1 =
    numericStat(
      st1,
      [
        "returnPointsWonPct",
        "return_points_won_pct",
        "returnWon"
      ]
    );

  const ret2 =
    numericStat(
      st2,
      [
        "returnPointsWonPct",
        "return_points_won_pct",
        "returnWon"
      ]
    );

  if($("moduleServe")){

    $("moduleServe").textContent =
      hold1 !== null &&
      hold2 !== null
        ? `${hold1}% / ${hold2}%`
        : "–";

    if($("moduleServeText")){

      $("moduleServeText").textContent =
        hold1 !== null &&
        hold2 !== null
          ? "Service Hold"
          : "Noch keine Servicedaten";
    }
  }

  if($("moduleReturn")){

    $("moduleReturn").textContent =
      ret1 !== null &&
      ret2 !== null
        ? `${ret1}% / ${ret2}%`
        : "–";

    if($("moduleReturnText")){

      $("moduleReturnText").textContent =
        ret1 !== null &&
        ret2 !== null
          ? "Return-Punkte"
          : "Noch keine Returndaten";
    }
  }
}


// =====================================================
// MISSION SCORE 3.0
// =====================================================

function clamp(
  value,
  min,
  max
){
  return Math.max(
    min,
    Math.min(
      max,
      value
    )
  );
}

function sideName(
  match,
  side
){
  return side === 1
    ? match.player1
    : side === 2
      ? match.player2
      : null;
}

function missionScoreV3(match){

  const marketPart =
    marketComponent(match);

  const h2h =
    h2hRecord(match);

  const surfaceName =
    match.surface ??
    match.court ??
    match.surfaceType ??
    "";

  const surface1 =
    surfaceName
      ? surfaceRecord(
          match.player1,
          match.tour,
          surfaceName
        )
      : null;

  const surface2 =
    surfaceName
      ? surfaceRecord(
          match.player2,
          match.tour,
          surfaceName
        )
      : null;

  const stats1 =
    statRecord(
      match.player1,
      match.tour
    );

  const stats2 =
    statRecord(
      match.player2,
      match.tour
    );

  const components = [];


  // MARKT MAX 25

  if(marketPart.available){

    const mk =
      market(match);

    const gap =
      Math.abs(
        mk.p1 -
        mk.p2
      );

    const score =
      clamp(
        Math.round(
          10 +
          gap * 0.25
        ),
        10,
        25
      );

    const side =
      mk.p1 === mk.p2
        ? 0
        : mk.p1 > mk.p2
          ? 1
          : 2;

    components.push({
      key: "market",
      label: "Markt",
      score,
      max: 25,
      side,
      available: true,
      detail:
        `${mk.p1}% / ${mk.p2}%`
    });

  }else{

    components.push({
      key: "market",
      label: "Markt",
      score: 0,
      max: 25,
      side: 0,
      available: false,
      detail: "–"
    });
  }


  // RANKING MAX 20

  const r1 =
    getRank(
      match.player1,
      match.tour
    );

  const r2 =
    getRank(
      match.player2,
      match.tour
    );

  if(r1 && r2){

    const diff =
      Math.abs(
        r1 -
        r2
      );

    const score =
      clamp(
        Math.round(
          6 +
          diff / 3
        ),
        6,
        20
      );

    const side =
      r1 === r2
        ? 0
        : r1 < r2
          ? 1
          : 2;

    components.push({
      key: "ranking",
      label: "Ranking",
      score,
      max: 20,
      side,
      available: true,
      detail:
        `#${r1} / #${r2}`
    });

  }else{

    components.push({
      key: "ranking",
      label: "Ranking",
      score: 0,
      max: 20,
      side: 0,
      available: false,
      detail: "–"
    });
  }


  // FORM MAX 20

  const f1 =
    getForm(
      match.player1,
      match.tour
    );

  const f2 =
    getForm(
      match.player2,
      match.tour
    );

  if(f1 && f2){

    const diff =
      Math.abs(
        f1.pct -
        f2.pct
      );

    const score =
      clamp(
        Math.round(
          6 +
          diff * 0.18
        ),
        6,
        20
      );

    const side =
      f1.pct === f2.pct
        ? 0
        : f1.pct > f2.pct
          ? 1
          : 2;

    components.push({
      key: "form",
      label: "Form",
      score,
      max: 20,
      side,
      available: true,
      detail:
        `${f1.pct}% / ${f2.pct}%`
    });

  }else{

    components.push({
      key: "form",
      label: "Form",
      score: 0,
      max: 20,
      side: 0,
      available: false,
      detail: "–"
    });
  }


  // H2H MAX 10

  if(h2h){

    const share1 =
      h2h.wins1 /
      h2h.total;

    const share2 =
      h2h.wins2 /
      h2h.total;

    const diff =
      Math.abs(
        share1 -
        share2
      );

    const score =
      clamp(
        Math.round(
          3 +
          diff * 10
        ),
        3,
        10
      );

    const side =
      h2h.wins1 === h2h.wins2
        ? 0
        : h2h.wins1 > h2h.wins2
          ? 1
          : 2;

    components.push({
      key: "h2h",
      label: "H2H",
      score,
      max: 10,
      side,
      available: true,
      detail:
        `${h2h.wins1}:${h2h.wins2}`
    });

  }else{

    components.push({
      key: "h2h",
      label: "H2H",
      score: 0,
      max: 10,
      side: 0,
      available: false,
      detail: "–"
    });
  }  // BELAG MAX 10

  if(surface1 && surface2){

    const diff =
      Math.abs(
        surface1.pct -
        surface2.pct
      );

    const score =
      clamp(
        Math.round(
          3 +
          diff * 0.12
        ),
        3,
        10
      );

    const side =
      surface1.pct === surface2.pct
        ? 0
        : surface1.pct > surface2.pct
          ? 1
          : 2;

    components.push({
      key: "surface",
      label: "Belag",
      score,
      max: 10,
      side,
      available: true,
      detail:
        `${surface1.pct}% / ${surface2.pct}%`
    });

  }else{

    components.push({
      key: "surface",
      label: "Belag",
      score: 0,
      max: 10,
      side: 0,
      available: false,
      detail: "–"
    });
  }


  // STATS MAX 15

  const statKeys = [
    [
      "holdPct",
      "hold_pct",
      "hold"
    ],
    [
      "breakPct",
      "break_pct",
      "break"
    ],
    [
      "firstServeWonPct",
      "first_serve_won_pct",
      "firstServeWon"
    ],
    [
      "returnPointsWonPct",
      "return_points_won_pct",
      "returnWon"
    ]
  ];

  if(stats1 && stats2){

    let p1wins = 0;
    let p2wins = 0;
    const diffs = [];

    for(const aliases of statKeys){

      const a =
        numericStat(
          stats1,
          aliases
        );

      const b =
        numericStat(
          stats2,
          aliases
        );

      if(
        a === null ||
        b === null
      ){
        continue;
      }

      diffs.push(
        Math.abs(
          a - b
        )
      );

      if(a > b){
        p1wins++;
      }
      else if(b > a){
        p2wins++;
      }
    }

    if(diffs.length){

      const avg =
        diffs.reduce(
          (sum, value) =>
            sum + value,
          0
        )
        /
        diffs.length;

      const score =
        clamp(
          Math.round(
            5 +
            avg * 0.7
          ),
          5,
          15
        );

      const side =
        p1wins === p2wins
          ? 0
          : p1wins > p2wins
            ? 1
            : 2;

      components.push({
        key: "stats",
        label: "Stats",
        score,
        max: 15,
        side,
        available: true,
        detail:
          `${diffs.length} Werte`
      });

    }else{

      components.push({
        key: "stats",
        label: "Stats",
        score: 0,
        max: 15,
        side: 0,
        available: false,
        detail: "–"
      });
    }

  }else{

    components.push({
      key: "stats",
      label: "Stats",
      score: 0,
      max: 15,
      side: 0,
      available: false,
      detail: "–"
    });
  }


  // =====================================================
  // DATENTIEFE + KONSENS
  // =====================================================

  const available =
    components.filter(
      c => c.available
    );

  const availableMax =
    available.reduce(
      (sum, c) =>
        sum + c.max,
      0
    );

  const evidence =
    Math.round(
      availableMax
      /
      100
      *
      100
    );


  let support1 = 0;
  let support2 = 0;

  for(const c of available){

    if(c.side === 1){
      support1 += c.score;
    }

    if(c.side === 2){
      support2 += c.score;
    }
  }

  const winnerSide =
    support1 === support2
      ? 0
      : support1 > support2
        ? 1
        : 2;


  const supporting =
    available.filter(
      c =>
        c.side === winnerSide
        &&
        winnerSide !== 0
    );

  const opposing =
    available.filter(
      c =>
        c.side !== 0
        &&
        c.side !== winnerSide
    );


  const supportScore =
    supporting.reduce(
      (sum, c) =>
        sum + c.score,
      0
    );

  const opposeScore =
    opposing.reduce(
      (sum, c) =>
        sum + c.score,
      0
    );


  const directional =
    Math.max(
      0,
      supportScore -
      opposeScore
    );


  const agreementDen =
    supportScore +
    opposeScore;


  const agreement =
    agreementDen
      ? supportScore /
        agreementDen
      : 0.5;


  const confidence =
    clamp(
      Math.round(
        45
        +
        evidence * 0.35
        +
        agreement * 20
      ),
      45,
      97
    );


  const score =
    clamp(
      Math.round(
        45
        +
        evidence * 0.25
        +
        directional * 0.35
        +
        agreement * 10
      ),
      45,
      97
    );


  return {
    score,
    confidence,
    evidence,
    winnerSide,
    winnerName:
      sideName(
        match,
        winnerSide
      ),
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

  if(value >= 85){
    return "Sehr hohe Datentiefe";
  }

  if(value >= 65){
    return "Hohe Datentiefe";
  }

  if(value >= 45){
    return "Mittlere Datentiefe";
  }

  if(value >= 25){
    return "Niedrige Datentiefe";
  }

  return "Sehr niedrige Datentiefe";
}


function componentByKey(
  report,
  key
){

  return (
    report.components.find(
      c => c.key === key
    )
    ||
    null
  );
}


function scoreLabel(score){

  if(score >= 86){
    return "Sehr interessantes Match";
  }

  if(score >= 72){
    return "Interessantes Match";
  }

  if(score >= 60){
    return "Beobachten";
  }

  return "Standard";
}


// =====================================================
// DATUM / MATCH-AUSWAHL
// =====================================================

function resolveActiveDate(){

  const today =
    dayString();

  if(
    STATE.matches.some(
      m => m.date === today
    )
  ){
    return today;
  }

  const dates = [
    ...new Set(
      STATE.matches
        .map(m => m.date)
        .filter(Boolean)
    )
  ].sort();

  return (
    dates.at(-1)
    ||
    today
  );
}


function currentMatches(){

  return STATE.matches.filter(
    m =>
      m.date === STATE.activeDate
      &&
      m.player1
      &&
      m.player2
  );
}


function dataDateLabel(){

  if(!STATE.activeDate){
    return "–";
  }

  if(
    STATE.activeDate ===
    dayString()
  ){
    return "Heute";
  }

  const d =
    new Date(
      `${STATE.activeDate}T12:00:00`
    );

  if(
    Number.isNaN(
      d.getTime()
    )
  ){
    return STATE.activeDate;
  }

  return d.toLocaleDateString(
    "de-DE",
    {
      day: "2-digit",
      month: "2-digit"
    }
  );
}


function setRing(
  element,
  value
){

  if(element){
    element.style.setProperty(
      "--value",
      String(value)
    );
  }
}


// =====================================================
// WATCHLIST
// =====================================================

function matchKey(match){

  return (
    match.id
    ||
    `${match.date}|${match.start}|${match.player1}|${match.player2}`
  );
}


function watchlistKeys(){

  try{

    const parsed =
      JSON.parse(
        localStorage.getItem(
          WATCH_KEY
        )
        ||
        "[]"
      );

    return Array.isArray(parsed)
      ? parsed
      : [];

  }catch{

    return [];
  }
}


function isWatched(match){

  return watchlistKeys()
    .includes(
      matchKey(match)
    );
}


function toggleWatch(match){

  const key =
    matchKey(match);

  const current =
    watchlistKeys();

  const next =
    current.includes(key)
      ? current.filter(
          x => x !== key
        )
      : [
          ...current,
          key
        ];

  localStorage.setItem(
    WATCH_KEY,
    JSON.stringify(next)
  );

  renderMatchList();
  renderAllMatches();
  renderWatchlist();
}


// =====================================================
// TOP MATCH
// =====================================================

function topMatch(){

  return (
    [...currentMatches()]
      .sort(
        (a,b) =>
          missionScore(b)
          -
          missionScore(a)
      )[0]
    ||
    null
  );
}


// =====================================================
// STATUS
// =====================================================

function renderStatus(payload){

  const list =
    currentMatches();

  const isToday =
    STATE.activeDate ===
    dayString();


  $("statusTitle").textContent =
    isToday
      ? "Mission Control online"
      : "Neuester Datenstand aktiv";


  $("statusText").textContent =
    isToday
      ? "Aktuelle Matches aus deinen Mission-1000-Daten."
      : "Für heute liegen noch keine Matches vor. Es wird automatisch der neueste verfügbare Spieltag gezeigt.";


  $("mcMatches").textContent =
    list.length;


  $("analyzedCount").textContent =
    list.length;


  const best =
    list.length
      ? Math.max(
          ...list.map(
            m => missionScore(m)
          )
        )
      : 0;


  $("bestScore").textContent =
    best;


  $("dataDate").textContent =
    dataDateLabel();


  const playerSlots =
    list.length * 2;


  const rankedSlots =
    list.reduce(
      (sum,m) =>
        sum
        +
        (
          getRank(
            m.player1,
            m.tour
          )
          ? 1
          : 0
        )
        +
        (
          getRank(
            m.player2,
            m.tour
          )
          ? 1
          : 0
        ),
      0
    );


  const formSlots =
    list.reduce(
      (sum,m) =>
        sum
        +
        (
          getForm(
            m.player1,
            m.tour
          )
          ? 1
          : 0
        )
        +
        (
          getForm(
            m.player2,
            m.tour
          )
          ? 1
          : 0
        ),
      0
    );


  $("rankingCoverage").textContent =
    playerSlots
      ? `${Math.round(
          rankedSlots
          /
          playerSlots
          *
          100
        )}%`
      : "0%";


  $("formCoverage").textContent =
    playerSlots
      ? `${Math.round(
          formSlots
          /
          playerSlots
          *
          100
        )}%`
      : "0%";


  if(payload?.generatedAt){

    $("updatedAt").textContent =
      new Date(
        payload.generatedAt
      ).toLocaleString(
        "de-DE",
        {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }
      );

  }else{

    $("updatedAt").textContent =
      "Datenstand –";
  }
}


// =====================================================
// HEADER STATS
// =====================================================

function renderStats(){

  const list =
    currentMatches();


  $("todayCount").textContent =
    list.length;


  $("liveCount").textContent =
    list.filter(
      m =>
        m.status ===
        "live-or-started"
    ).length;


  $("atpCount").textContent =
    list.filter(
      m =>
        String(
          m.tour
        ).toUpperCase()
        ===
        "ATP"
    ).length;


  $("wtaCount").textContent =
    list.filter(
      m =>
        String(
          m.tour
        ).toUpperCase()
        ===
        "WTA"
    ).length;
}// =====================================================
// TOP MATCH RENDERN
// =====================================================

function renderTop(){

  const match =
    topMatch();


  if(!match){

    $("topContent")
      .classList
      .add("hidden");


    $("topEmpty")
      .classList
      .remove("hidden");

    return;
  }


  $("topContent")
    .classList
    .remove("hidden");


  $("topEmpty")
    .classList
    .add("hidden");


  $("topMeta1").textContent =
    match.tour || "";


  $("topMeta2").textContent =
    match.tour || "";


  $("topPlayer1").textContent =
    match.player1;


  $("topPlayer2").textContent =
    match.player2;


  $("topFlag1").textContent =
    playerFlag(
      match.player1,
      match.tour,
      match,
      1
    );


  $("topFlag2").textContent =
    playerFlag(
      match.player2,
      match.tour,
      match,
      2
    );


  const r1 =
    getRank(
      match.player1,
      match.tour
    );


  const r2 =
    getRank(
      match.player2,
      match.tour
    );


  $("topRank1").textContent =
    r1
      ? `${match.tour} #${r1}`
      : "Ranking –";


  $("topRank2").textContent =
    r2
      ? `${match.tour} #${r2}`
      : "Ranking –";


  $("topEvent").textContent =
    match.event ||
    "Turnier";


  $("topStart").textContent =
    `${dataDateLabel()} · ${match.start || "–"}`;


  const report =
    missionScoreV3(match);


  const score =
    report.score;


  const conf =
    report.confidence;


  const mk =
    market(match);


  $("topScore").textContent =
    score;


  setRing(
    $("topScore").parentElement,
    score
  );


  $("topConfidence").textContent =
    `${conf}%`;


  $("confidenceBar").style.width =
    `${conf}%`;


  $("confidenceLabel").textContent =
    conf >= 88
      ? "SEHR HOCH"
      : conf >= 76
        ? "HOCH"
        : "SOLIDE";


  if(report.winnerName){

    $("marketTrend").textContent =
      `${report.winnerName} · ${report.evidence}% Daten`;

  }
  else if(mk){

    const fav =
      mk.p1 >= mk.p2
        ? match.player1
        : match.player2;


    $("marketTrend").textContent =
      `${fav} ↗ ${Math.max(
        mk.p1,
        mk.p2
      )}%`;

  }
  else{

    $("marketTrend").textContent =
      "Analyse noch offen";
  }
}


// =====================================================
// PLAYER ÖFFNEN
// =====================================================

function openPlayer(player){

  showPlayerProfile(player);


  document
    .querySelectorAll(
      ".bottom-nav button"
    )
    .forEach(
      b =>
        b.classList.remove(
          "active"
        )
    );


  const target =
    document.querySelector(
      '.bottom-nav button[data-view="playerView"]'
    );


  if(target){
    target.classList.add(
      "active"
    );
  }


  document
    .querySelectorAll(
      ".app-view"
    )
    .forEach(
      view =>
        view.classList.add(
          "hidden"
        )
    );


  $("playerView")
    .classList
    .remove("hidden");


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


// =====================================================
// MATCH CARD
// =====================================================

function buildMatchCard(match){

  const r1 =
    getRank(
      match.player1,
      match.tour
    );


  const r2 =
    getRank(
      match.player2,
      match.tour
    );


  const report =
    missionScoreV3(match);


  const el =
    document.createElement(
      "article"
    );


  el.className =
    "match-card with-watch";


  el.innerHTML = `

    <div class="time">

      ${match.start || "–"}

      <small>
        ${
          match.status ===
          "live-or-started"
            ? "LIVE"
            : dataDateLabel()
        }
      </small>

    </div>


    <div class="names">

      <b data-player="1">

        <span class="flag-inline">

          ${
            playerFlag(
              match.player1,
              match.tour,
              match,
              1
            )
          }

        </span>

        ${match.player1}

        <span>

          ${
            r1
              ? `${match.tour} #${r1}`
              : ""
          }

        </span>

      </b>


      <b data-player="2">

        <span class="flag-inline">

          ${
            playerFlag(
              match.player2,
              match.tour,
              match,
              2
            )
          }

        </span>

        ${match.player2}

        <span>

          ${
            r2
              ? `${match.tour} #${r2}`
              : ""
          }

        </span>

      </b>

    </div>


    <div class="score">

      ${report.score}

    </div>


    <button
      class="watch-star ${
        isWatched(match)
          ? "active"
          : ""
      }"
      aria-label="Watchlist">

      ${
        isWatched(match)
          ? "★"
          : "☆"
      }

    </button>

  `;


  el.onclick =
    event => {

      if(
        event.target.closest(
          ".watch-star"
        )
        ||
        event.target.closest(
          "[data-player]"
        )
      ){
        return;
      }

      showDetails(match);
    };


  const watchButton =
    el.querySelector(
      ".watch-star"
    );


  if(watchButton){

    watchButton.onclick =
      event => {

        event.stopPropagation();

        toggleWatch(match);
      };
  }


  el
    .querySelectorAll(
      "[data-player]"
    )
    .forEach(
      node => {

        node.style.cursor =
          "pointer";


        node.onclick =
          event => {

            event.stopPropagation();


            const side =
              Number(
                node.dataset.player
              );


            const name =
              side === 1
                ? match.player1
                : match.player2;


            openPlayer({

              name,

              tour:
                match.tour,

              flag:
                playerFlag(
                  name,
                  match.tour,
                  match,
                  side
                )

            });
          };
      }
    );


  return el;
}


// =====================================================
// MATCH LIST
// =====================================================

function renderMatchList(){

  const wrap =
    $("matchList");


  if(!wrap){
    return;
  }


  wrap.innerHTML =
    "";


  let list =
    [...currentMatches()]
      .sort(
        (a,b) =>
          missionScore(b)
          -
          missionScore(a)
      );


  if(!STATE.showAll){

    list =
      list.slice(
        0,
        6
      );
  }


  $("listTitle").textContent =
    STATE.activeDate ===
    dayString()
      ? "Wichtige Matches"
      : "Neuester Spieltag";


  if(!list.length){

    wrap.innerHTML =
      '<div class="empty">Keine Matches verfügbar.</div>';

    return;
  }


  list.forEach(
    match => {

      wrap.appendChild(
        buildMatchCard(
          match
        )
      );
    }
  );


  $("toggleAllBtn").textContent =
    STATE.showAll
      ? "Weniger"
      : "Alle ansehen";
}


// =====================================================
// ALLE MATCHES
// =====================================================

function renderAllMatches(){

  const wrap =
    $("allMatchesList");


  if(!wrap){
    return;
  }


  wrap.innerHTML =
    "";


  const list =
    [...currentMatches()]
      .sort(
        (a,b) =>
          String(
            a.start || ""
          )
          .localeCompare(
            String(
              b.start || ""
            )
          )
      );


  if(!list.length){

    wrap.innerHTML =
      '<div class="empty">Keine Matches verfügbar.</div>';

    return;
  }


  list.forEach(
    match => {

      wrap.appendChild(
        buildMatchCard(
          match
        )
      );
    }
  );
}


// =====================================================
// WATCHLIST
// =====================================================

function renderWatchlist(){

  const wrap =
    $("watchlistList");


  if(!wrap){
    return;
  }


  wrap.innerHTML =
    "";


  const keys =
    watchlistKeys();


  const list =
    STATE.matches.filter(
      match =>
        keys.includes(
          matchKey(match)
        )
    );


  if(!list.length){

    wrap.innerHTML =
      '<div class="empty">Noch keine Matches gespeichert. Tippe bei einem Match auf ☆.</div>';

    return;
  }


  list.forEach(
    match => {

      wrap.appendChild(
        buildMatchCard(
          match
        )
      );
    }
  );
}


// =====================================================
// PLAYER INDEX
// =====================================================

function uniquePlayers(){

  const map =
    new Map();


  STATE.matches
    .forEach(
      match => {

        [
          {
            name:
              match.player1,

            tour:
              match.tour,

            flag:
              playerFlag(
                match.player1,
                match.tour,
                match,
                1
              )
          },

          {
            name:
              match.player2,

            tour:
              match.tour,

            flag:
              playerFlag(
                match.player2,
                match.tour,
                match,
                2
              )
          }

        ].forEach(
          player => {

            if(!player.name){
              return;
            }


            const key =
              `${
                String(
                  player.tour ||
                  ""
                )
                .toUpperCase()
              }|${
                normalizeName(
                  player.name
                )
              }`;


            if(!map.has(key)){

              map.set(
                key,
                player
              );
            }
          }
        );
      }
    );


  STATE.rankings
    .forEach(
      player => {

        const name =
          player.name ??
          player.player ??
          player.playerName ??
          player.player_name;


        if(!name){
          return;
        }


        const tour =
          player.tour ??
          "ATP";


        const key =
          `${
            String(
              tour
            )
            .toUpperCase()
          }|${
            normalizeName(
              name
            )
          }`;


        if(!map.has(key)){

          map.set(
            key,
            {
              name,
              tour,

              flag:
                playerFlag(
                  name,
                  tour
                )
            }
          );
        }
      }
    );


  return [
    ...map.values()
  ]
  .sort(
    (a,b) =>
      a.name.localeCompare(
        b.name,
        "de"
      )
  );
}


// =====================================================
// PLAYER PROFIL
// =====================================================

function showPlayerProfile(player){

  const box =
    $("playerProfile");


  if(!box){
    return;
  }


  const rank =
    getRank(
      player.name,
      player.tour
    );


  const form =
    getForm(
      player.name,
      player.tour
    );


  const played =
    STATE.matches.filter(
      match =>
        normalizeName(
          match.player1
        )
        ===
        normalizeName(
          player.name
        )
        ||
        normalizeName(
          match.player2
        )
        ===
        normalizeName(
          player.name
        )
    ).length;


  box.classList.remove(
    "empty-state"
  );


  box.innerHTML = `

    <div class="profile-avatar">

      ${player.flag || "🎾"}

    </div>


    <div>

      <span class="eyebrow">

        ${
          player.tour ||
          "TENNIS"
        }

      </span>


      <h3>

        ${player.name}

      </h3>


      <p>

        ${
          rank
            ? `${player.tour} #${rank}`
            : "Ranking noch nicht verfügbar"
        }

      </p>

    </div>


    <div class="profile-metrics">

      <article>

        <span>
          RANKING
        </span>

        <b>
          ${
            rank
              ? `#${rank}`
              : "–"
          }
        </b>

      </article>


      <article>

        <span>
          FORM
        </span>

        <b>
          ${
            form
              ? `${form.pct}%`
              : "–"
          }
        </b>

      </article>


      <article>

        <span>
          MATCHES
        </span>

        <b>
          ${played}
        </b>

      </article>

    </div>

  `;
}


// =====================================================
// PLAYER SUCHE
// =====================================================

function renderPlayerSearch(
  query = ""
){

  const wrap =
    $("playerResults");


  if(!wrap){
    return;
  }


  const q =
    normalizeName(
      query
    );


  const players =
    uniquePlayers()
      .filter(
        player =>
          !q
          ||
          normalizeName(
            player.name
          )
          .includes(q)
      )
      .slice(
        0,
        20
      );


  wrap.innerHTML =
    "";


  if(!players.length){

    wrap.innerHTML =
      '<div class="empty">Kein Spieler gefunden.</div>';

    return;
  }


  players.forEach(
    player => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "player-result";


      const rank =
        getRank(
          player.name,
          player.tour
        );


      row.innerHTML = `

        <span class="flag">

          ${player.flag || "🎾"}

        </span>


        <button type="button">

          <strong>

            ${player.name}

          </strong>


          <small>

            ${
              player.tour ||
              ""
            }

            ${
              rank
                ? ` · #${rank}`
                : ""
            }

          </small>

        </button>

      `;


      const button =
        row.querySelector(
          "button"
        );


      if(button){

        button.onclick =
          () =>
            showPlayerProfile(
              player
            );
      }


      wrap.appendChild(
        row
      );
    }
  );
}// =====================================================
// MISSION AI
// =====================================================

function renderAI(){

  const box =
    $("aiReport");


  if(!box){
    return;
  }


  const match =
    topMatch();


  if(!match){

    box.textContent =
      "Noch kein Match für einen Mission Report verfügbar.";

    return;
  }


  const report =
    missionScoreV3(
      match
    );


  const r1 =
    getRank(
      match.player1,
      match.tour
    );


  const r2 =
    getRank(
      match.player2,
      match.tour
    );


  const f1 =
    getForm(
      match.player1,
      match.tour
    );


  const f2 =
    getForm(
      match.player2,
      match.tour
    );


  const mk =
    market(
      match
    );


  $("aiScore").textContent =
    report.score;


  setRing(
    $("aiScore").parentElement,
    report.score
  );


  $("aiMatchTitle").textContent =
    `${match.player1} vs. ${match.player2}`;


  $("aiMatchMeta").textContent =
    `${match.tour || ""} · ${match.event || "Turnier"} · ${match.start || "–"}`;


  $("aiMarket").textContent =
    mk
      ? `${mk.p1}% / ${mk.p2}%`
      : "–";


  $("aiRanking").textContent =
    r1 && r2
      ? `${r1} / ${r2}`
      : "–";


  $("aiForm").textContent =
    f1 && f2
      ? `${f1.pct}% / ${f2.pct}%`
      : "–";


  $("aiConfidence").textContent =
    `${report.confidence}%`;


  const parts = [];


  parts.push(
    `${playerFlag(
      match.player1,
      match.tour,
      match,
      1
    )} ${match.player1} trifft auf ${playerFlag(
      match.player2,
      match.tour,
      match,
      2
    )} ${match.player2}.`
  );


  if(report.winnerName){

    parts.push(
      `Die aktuelle Datenlage spricht insgesamt eher für ${report.winnerName}.`
    );

  }else{

    parts.push(
      "Die verfügbaren Faktoren ergeben aktuell keinen klaren Gesamtsieger."
    );
  }


  const strongest =
    [...report.components]
      .filter(
        component =>
          component.available
          &&
          component.side !== 0
      )
      .sort(
        (a,b) =>
          b.score -
          a.score
      )
      .slice(
        0,
        3
      );


  if(strongest.length){

    parts.push(
      `Stärkste Faktoren: ${
        strongest
          .map(
            component =>
              `${component.label} ${component.score}/${component.max}`
          )
          .join(", ")
      }.`
    );
  }


  parts.push(
    `${evidenceLabel(
      report.evidence
    )} (${report.evidence} %). Mission Score ${report.score}/100, Confidence ${report.confidence} %.`
  );


  box.textContent =
    parts.join(" ");
}


// =====================================================
// MATCH DETAILS
// =====================================================

function showDetails(match){

  const report =
    missionScoreV3(
      match
    );


  const score =
    report.score;


  const mk =
    market(
      match
    );


  const r1 =
    getRank(
      match.player1,
      match.tour
    );


  const r2 =
    getRank(
      match.player2,
      match.tour
    );


  const f1 =
    getForm(
      match.player1,
      match.tour
    );


  const f2 =
    getForm(
      match.player2,
      match.tour
    );


  $("detailsPanel")
    .classList
    .remove(
      "hidden"
    );


  $("detailTitle").textContent =
    `${match.player1} vs. ${match.player2}`;


  $("detailScore").textContent =
    score;


  setRing(
    $("detailScore").parentElement,
    score
  );


  $("detailSignal").textContent =
    report.winnerName
      ? `${scoreLabel(score)} · ${report.winnerName}`
      : scoreLabel(score);


  let narrative =
    report.winnerName
      ? `Die Gesamtdaten sprechen aktuell eher für ${report.winnerName}.`
      : "Die verfügbaren Faktoren sind aktuell weitgehend ausgeglichen.";


  narrative +=
    ` ${evidenceLabel(
      report.evidence
    )} mit ${report.evidence} % Datenabdeckung.`;


  $("detailNarrative").textContent =
    narrative;


  $("factorMarket").textContent =
    mk
      ? `${mk.p1}% / ${mk.p2}%`
      : "–";


  $("factorRanking").textContent =
    r1 && r2
      ? `${r1} / ${r2}`
      : "–";


  $("factorForm").textContent =
    f1 && f2
      ? `${f1.pct}% / ${f2.pct}%`
      : "–";


  $("factorConfidence").textContent =
    `${report.confidence}%`;


  const map = [
    [
      "market",
      "scoreMarket",
      "barMarket"
    ],
    [
      "ranking",
      "scoreRanking",
      "barRanking"
    ],
    [
      "form",
      "scoreForm",
      "barForm"
    ]
  ];


  for(
    const [
      key,
      scoreId,
      barId
    ]
    of map
  ){

    const component =
      componentByKey(
        report,
        key
      );


    if(!component){
      continue;
    }


    $(scoreId).textContent =
      component.available
        ? `${component.score}/${component.max}`
        : `0/${component.max}`;


    $(barId).style.width =
      component.available
        ? `${component.score / component.max * 100}%`
        : "0%";
  }


  $("detailP1").textContent =
    `${playerFlag(
      match.player1,
      match.tour,
      match,
      1
    )} ${match.player1}`;


  $("detailP2").textContent =
    `${playerFlag(
      match.player2,
      match.tour,
      match,
      2
    )} ${match.player2}`;


  $("detailO1").textContent =
    odd(
      match.odds1
    );


  $("detailO2").textContent =
    odd(
      match.odds2
    );


  $("detailBook1").textContent =
    match.bookmaker1
    ||
    match.book1
    ||
    "Quote";


  $("detailBook2").textContent =
    match.bookmaker2
    ||
    match.book2
    ||
    "Quote";


  if(r1 && r2){

    $("moduleRanking").textContent =
      `#${r1} / #${r2}`;


    $("moduleRankingText").textContent =
      `${
        r1 < r2
          ? match.player1
          : match.player2
      } liegt ${Math.abs(r1-r2)} Plätze vorn`;

  }else{

    $("moduleRanking").textContent =
      "–";


    $("moduleRankingText").textContent =
      "Ranking noch nicht vollständig";
  }


  if(f1 && f2){

    $("moduleForm").textContent =
      `${f1.pct}% / ${f2.pct}%`;


    $("moduleFormText").textContent =
      f1.pct === f2.pct
        ? "Form aktuell ausgeglichen"
        : `${
            f1.pct > f2.pct
              ? match.player1
              : match.player2
          } mit Formvorteil`;

  }else{

    $("moduleForm").textContent =
      "–";


    $("moduleFormText").textContent =
      "Form noch nicht vollständig";
  }


  renderOptionalDetails(
    match
  );


  const h2hComponent =
    componentByKey(
      report,
      "h2h"
    );


  const surfaceComponent =
    componentByKey(
      report,
      "surface"
    );


  const statsComponent =
    componentByKey(
      report,
      "stats"
    );


  if(
    h2hComponent?.available
    &&
    $("moduleH2HText")
  ){

    $("moduleH2HText").textContent +=
      ` · Score ${h2hComponent.score}/${h2hComponent.max}`;
  }


  if(
    surfaceComponent?.available
    &&
    $("moduleSurfaceText")
  ){

    $("moduleSurfaceText").textContent +=
      ` · Score ${surfaceComponent.score}/${surfaceComponent.max}`;
  }


  if(
    statsComponent?.available
    &&
    $("moduleServeText")
  ){

    $("moduleServeText").textContent +=
      ` · Stats ${statsComponent.score}/${statsComponent.max}`;
  }


  $("detailsPanel")
    .scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
}


// =====================================================
// JSON LOADER
// =====================================================

async function fetchJson(
  path,
  fallback
){

  try{

    const response =
      await fetch(
        `${path}?v=${Date.now()}`,
        {
          cache: "no-store"
        }
      );


    if(!response.ok){

      throw new Error(
        `${path}: HTTP ${response.status}`
      );
    }


    return await response.json();

  }catch(error){

    console.warn(
      "Mission 1000 JSON Fehler:",
      path,
      error
    );


    return fallback;
  }
}


// =====================================================
// CORE-DATEN NORMALISIEREN
// =====================================================

function normalizeMatchesPayload(
  payload
){

  if(
    payload
    &&
    Array.isArray(
      payload.matches
    )
  ){
    return payload.matches;
  }


  if(Array.isArray(payload)){
    return payload;
  }


  return [];
}


function normalizePlayerPayload(
  payload,
  keys = []
){

  if(Array.isArray(payload)){
    return payload;
  }


  if(
    !payload
    ||
    typeof payload !== "object"
  ){
    return [];
  }


  for(const key of keys){

    if(
      Array.isArray(
        payload[key]
      )
    ){
      return payload[key];
    }
  }


  return [];
}


// =====================================================
// PROGRESSIVE LOADER
// =====================================================

async function loadCoreMatches(){

  $("statusTitle").textContent =
    "Matches werden geladen";


  $("statusText").textContent =
    "Mission Control lädt zuerst den aktuellen Spieltag.";


  const matchesPayload =
    await fetchJson(
      "./data/matches.json",
      {
        matches: []
      }
    );


  STATE.matches =
    normalizeMatchesPayload(
      matchesPayload
    );


  STATE.activeDate =
    resolveActiveDate();


  renderStatus(
    matchesPayload
  );


  renderStats();


  renderTop();


  renderMatchList();


  renderAllMatches();


  renderWatchlist();


  return matchesPayload;
}


async function loadSecondaryData(){

  $("statusTitle").textContent =
    "Intelligence wird geladen";


  $("statusText").textContent =
    "Rankings, Form und Spielerprofile werden im Hintergrund ergänzt.";


  const results =
    await Promise.allSettled([
      fetchJson(
        "./data/rankings.json",
        {
          players: []
        }
      ),

      fetchJson(
        "./data/form.json",
        {
          players: []
        }
      ),

      fetchJson(
        "./data/players.json",
        {
          players: []
        }
      )
    ]);


  const rankingsPayload =
    results[0].status ===
    "fulfilled"
      ? results[0].value
      : {
          players: []
        };


  const formsPayload =
    results[1].status ===
    "fulfilled"
      ? results[1].value
      : {
          players: []
        };


  const playersPayload =
    results[2].status ===
    "fulfilled"
      ? results[2].value
      : {
          players: []
        };


  STATE.rankings =
    normalizePlayerPayload(
      rankingsPayload,
      [
        "players",
        "rankings",
        "data"
      ]
    );


  STATE.forms =
    normalizePlayerPayload(
      formsPayload,
      [
        "players",
        "form",
        "data"
      ]
    );


  STATE.players =
    normalizePlayerPayload(
      playersPayload,
      [
        "players",
        "data"
      ]
    );


  renderStatus(
    {
      generatedAt:
        rankingsPayload.generatedAt
        ||
        formsPayload.generatedAt
        ||
        null
    }
  );


  renderTop();


  renderMatchList();


  renderAllMatches();


  renderWatchlist();


  renderPlayerSearch(
    $("playerSearch")?.value
    ||
    ""
  );


  renderAI();
}


async function loadIntelligenceLayer(){

  $("statusTitle").textContent =
    "Mission Intelligence wird geladen";


  $("statusText").textContent =
    "H2H, Belag sowie Serve- und Return-Daten werden ergänzt.";


  await loadOptionalIntelligence();


  renderOptionalCoverage();


  renderTop();


  renderMatchList();


  renderAllMatches();


  renderWatchlist();


  renderAI();


  $("statusTitle").textContent =
    "Mission Control online";


  $("statusText").textContent =
    STATE.activeDate ===
    dayString()
      ? "Aktuelle Matches und Intelligence-Daten sind geladen."
      : "Der neueste verfügbare Spieltag und Intelligence-Daten sind geladen.";
}


// =====================================================
// HAUPT-LOAD
// =====================================================

async function load(){

  try{

    await loadCoreMatches();

  }catch(error){

    console.error(
      "Core Match Loader Fehler:",
      error
    );


    $("statusTitle").textContent =
      "Matchdaten konnten nicht geladen werden";


    $("statusText").textContent =
      "Bitte Mission 1000 aktualisieren.";

    return;
  }


  try{

    await loadSecondaryData();

  }catch(error){

    console.warn(
      "Secondary Data Loader Fehler:",
      error
    );
  }


  try{

    await loadIntelligenceLayer();

  }catch(error){

    console.warn(
      "Intelligence Loader Fehler:",
      error
    );


    $("statusTitle").textContent =
      "Mission Control online";


    $("statusText").textContent =
      "Matches sind geladen. Einige Intelligence-Daten fehlen aktuell.";
  }
}


// =====================================================
// BUTTONS
// =====================================================

if($("refreshBtn")){

  $("refreshBtn").onclick =
    () =>
      load();
}


if($("toggleAllBtn")){

  $("toggleAllBtn").onclick =
    () => {

      STATE.showAll =
        !STATE.showAll;


      renderMatchList();
    };
}


if($("closeDetailsBtn")){

  $("closeDetailsBtn").onclick =
    () =>
      $("detailsPanel")
        .classList
        .add(
          "hidden"
        );
}


// =====================================================
// PLAYER SEARCH
// =====================================================

if($("playerSearch")){

  $("playerSearch")
    .addEventListener(
      "input",
      event =>
        renderPlayerSearch(
          event.target.value
        )
    );
}


// =====================================================
// BOTTOM NAVIGATION
// =====================================================

document
  .querySelectorAll(
    ".bottom-nav button[data-view]"
  )
  .forEach(
    button => {

      button.onclick =
        () => {

          document
            .querySelectorAll(
              ".bottom-nav button"
            )
            .forEach(
              navButton =>
                navButton
                  .classList
                  .remove(
                    "active"
                  )
            );


          button
            .classList
            .add(
              "active"
            );


          document
            .querySelectorAll(
              ".app-view"
            )
            .forEach(
              view =>
                view
                  .classList
                  .add(
                    "hidden"
                  )
            );


          const view =
            $(
              button.dataset.view
            );


          if(view){

            view
              .classList
              .remove(
                "hidden"
              );
          }


          window.scrollTo({
            top: 0,
            behavior: "smooth"
          });
        };
    }
  );


// =====================================================
// START
// =====================================================

load();


// =====================================================
// SERVICE WORKER CLEANUP
// =====================================================

if(
  "serviceWorker"
  in
  navigator
){

  window.addEventListener(
    "load",
    async () => {

      try{

        const registrations =
          await navigator
            .serviceWorker
            .getRegistrations();


        await Promise.all(
          registrations.map(
            registration =>
              registration.unregister()
          )
        );

      }catch(error){

        console.warn(
          "Service Worker Cleanup fehlgeschlagen:",
          error
        );
      }
    }
  );
}
