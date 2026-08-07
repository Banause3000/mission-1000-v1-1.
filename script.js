let all = [];
let rankings = [];
let filter = "all";
let dayFilter = "today";
let searchTerm = "";
let selectedMatch = null;
let generatedAt = null;
let rankingsGeneratedAt = null;
let countdownTimer = null;

const $ = id => document.getElementById(id);
const FAVORITES_KEY = "mission1000-favorites-v1";

/* ------------------------------
   FAVORITEN / WATCHLIST
------------------------------ */

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(list) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

function matchKey(match) {
  return match.id || `${match.date}|${match.start}|${match.player1}|${match.player2}`;
}

function isFavorite(match) {
  return getFavorites().includes(matchKey(match));
}

function toggleFavorite(match) {
  const key = matchKey(match);
  const favorites = getFavorites();

  if (favorites.includes(key)) {
    saveFavorites(favorites.filter(item => item !== key));
  } else {
    saveFavorites([...favorites, key]);
  }

  updateFavoriteButton(match);
  render();
  updateMissionControl();
}

function updateFavoriteButton(match) {
  const button = $("favoriteBtn");
  if (!button || !match) return;

  const active = isFavorite(match);
  button.textContent = active ? "★" : "☆";
  button.classList.toggle("active", active);
}

/* ------------------------------
   HILFSFUNKTIONEN
------------------------------ */

function odd(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "–";
}

function statusText(status) {
  if (status === "upcoming") return "Bevorstehend";
  if (status === "live-or-started") return "LIVE / gestartet";
  if (status === "completed") return "Beendet";
  return status || "Unbekannt";
}

function localDayString(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function todayString() {
  return localDayString(new Date());
}

function tomorrowString() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDayString(d);
}

/* ------------------------------
   RANKING ENGINE
------------------------------ */

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´]/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getPlayerRanking(playerName, tour) {
  const wantedName = normalizeName(playerName);
  const wantedTour = String(tour || "").toUpperCase();

  const player = rankings.find(item =>
    normalizeName(item.name) === wantedName &&
    String(item.tour || "").toUpperCase() === wantedTour
  );

  if (!player) return null;

  const rank = Number(player.rank);

  // rank 0 = Platzhalter / unbekannt und wird NICHT angezeigt
  if (!Number.isFinite(rank) || rank <= 0) return null;

  return rank;
}

function rankingAdvantage(match) {
  const r1 = getPlayerRanking(match.player1, match.tour);
  const r2 = getPlayerRanking(match.player2, match.tour);

  if (!r1 || !r2) {
    return {
      r1,
      r2,
      available: false,
      advantage: null,
      difference: null
    };
  }

  const difference = Math.abs(r1 - r2);

  return {
    r1,
    r2,
    available: true,
    advantage: r1 < r2 ? match.player1 : r2 < r1 ? match.player2 : null,
    difference
  };
}

function rankingScore(match) {
  const info = rankingAdvantage(match);

  if (!info.available) return null;

  const diff = info.difference;

  if (diff >= 100) return 20;
  if (diff >= 60) return 18;
  if (diff >= 40) return 16;
  if (diff >= 25) return 14;
  if (diff >= 15) return 12;
  if (diff >= 8) return 10;
  if (diff >= 4) return 8;
  if (diff >= 1) return 6;

  return 5;
}

function ensureRankingCard() {
  if ($("rankingCard")) return;

  const breakdown = document.querySelector(".breakdown");

  if (!breakdown) return;

  breakdown.insertAdjacentHTML(
    "beforebegin",
    `
      <div id="rankingCard" class="ranking-card" style="
        margin-top:15px;
        padding:14px;
        border:1px solid #283a4e;
        border-radius:17px;
        background:#08121a;
      ">
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
          margin-bottom:12px;
        ">
          <div>
            <span style="
              color:#4de07f;
              font-weight:950;
              letter-spacing:.14em;
              text-transform:uppercase;
              font-size:.68rem;
            ">Ranking</span>
            <h3 style="margin:5px 0 0 0;">ATP / WTA Ranking</h3>
          </div>

          <span id="rankingStatus" style="
            padding:5px 8px;
            border-radius:999px;
            background:#0b1720;
            color:#98a8b8;
            font-size:.64rem;
          ">Lädt …</span>
        </div>

        <div style="
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px;
        ">
          <div style="
            padding:11px;
            border:1px solid #283a4e;
            border-radius:13px;
          ">
            <span id="rankingName1" style="
              display:block;
              color:#98a8b8;
              font-size:.65rem;
            ">Spieler 1</span>

            <b id="ranking1" style="
              display:block;
              margin-top:4px;
              font-size:1.15rem;
            ">–</b>
          </div>

          <div style="
            padding:11px;
            border:1px solid #283a4e;
            border-radius:13px;
          ">
            <span id="rankingName2" style="
              display:block;
              color:#98a8b8;
              font-size:.65rem;
            ">Spieler 2</span>

            <b id="ranking2" style="
              display:block;
              margin-top:4px;
              font-size:1.15rem;
            ">–</b>
          </div>
        </div>

        <div id="rankingSummary" style="
          margin-top:12px;
          padding:11px;
          border-radius:13px;
          background:rgba(77,224,127,.05);
          color:#d4dee5;
          font-size:.74rem;
          line-height:1.5;
        ">
          Rankingdaten werden geladen.
        </div>
      </div>
    `
  );
}

function updateRankingCard(match) {
  ensureRankingCard();

  if (!$("rankingCard")) return;

  const info = rankingAdvantage(match);
  const score = rankingScore(match);

  $("rankingName1").textContent = match.player1;
  $("rankingName2").textContent = match.player2;

  $("ranking1").textContent = info.r1 ? `#${info.r1}` : "–";
  $("ranking2").textContent = info.r2 ? `#${info.r2}` : "–";

  if (!info.available) {
    $("rankingStatus").textContent = "Teilweise Daten";
    $("rankingSummary").textContent =
      "Für mindestens einen Spieler liegt noch kein gültiger Rankingwert vor. Platzhalter mit Rang 0 werden bewusst nicht angezeigt.";
    return;
  }

  $("rankingStatus").textContent = "Ranking aktiv";

  if (!info.advantage) {
    $("rankingSummary").textContent =
      `Beide Spieler stehen auf demselben Rankingplatz. Ranking Score: ${score}/20.`;
    return;
  }

  $("rankingSummary").textContent =
    `${info.advantage} hat den Rankingvorteil. Unterschied: ${info.difference} Plätze. Ranking Score: ${score}/20.`;
}

/* ------------------------------
   MARKT ENGINE
------------------------------ */

function marketProbabilities(match) {
  const o1 = Number(match.odds1);
  const o2 = Number(match.odds2);

  if (!Number.isFinite(o1) || !Number.isFinite(o2) || o1 <= 1 || o2 <= 1) {
    return null;
  }

  const raw1 = 1 / o1;
  const raw2 = 1 / o2;
  const total = raw1 + raw2;

  return {
    p1: raw1 / total,
    p2: raw2 / total,
    overround: total
  };
}

function marketPercentages(match) {
  const probs = marketProbabilities(match);
  if (!probs) return null;

  const p1 = Math.round(probs.p1 * 100);
  return { p1, p2: 100 - p1 };
}

function scoreParts(match) {
  const pct = marketPercentages(match);

  const dataQuality =
    (Number.isFinite(Number(match.odds1)) ? 15 : 0) +
    (Number.isFinite(Number(match.odds2)) ? 15 : 0);

  let balance = 0;
  if (pct) {
    const difference = Math.abs(pct.p1 - pct.p2);
    balance = Math.round(Math.max(0, 50 - difference) * 0.9);
  }

  let timing = 0;
  if (match.date === todayString()) timing = 15;
  else if (match.date === tomorrowString()) timing = 10;

  const metadata =
    (match.event && match.event !== "–" ? 5 : 0) +
    (match.tour === "ATP" || match.tour === "WTA" ? 5 : 0);

  return {
    dataQuality,
    balance,
    timing,
    metadata,
    total: Math.min(100, dataQuality + balance + timing + metadata)
  };
}

function matchScore(match) {
  return scoreParts(match).total;
}

function matchScoreLabel(score) {
  if (score >= 85) return "Sehr interessant";
  if (score >= 70) return "Interessant";
  if (score >= 55) return "Beobachten";
  return "Niedrige Priorität";
}

function matchScoreTier(score) {
  if (score >= 90) return "💎 Elite Match";
  if (score >= 80) return "🔥 Top Match";
  if (score >= 70) return "⭐ Interessant";
  if (score >= 60) return "👀 Beobachten";
  return "Standard";
}

function marketConfidence(match) {
  const probs = marketProbabilities(match);
  if (!probs) return 0;

  const margin = Math.max(0, probs.overround - 1);
  const marginQuality = Math.max(0, 100 - Math.round(margin * 300));

  const completeness =
    (Number.isFinite(Number(match.odds1)) ? 25 : 0) +
    (Number.isFinite(Number(match.odds2)) ? 25 : 0) +
    (match.bookmaker1 ? 10 : 0) +
    (match.bookmaker2 ? 10 : 0) +
    (match.event ? 10 : 0) +
    (match.startIso ? 10 : 0) +
    (match.tour ? 10 : 0);

  return Math.round((marginQuality * 0.55) + (Math.min(100, completeness) * 0.45));
}

function heatScore(match) {
  const pct = marketPercentages(match);
  const score = matchScore(match);
  const confidence = marketConfidence(match);

  let balanceBonus = 0;

  if (pct) {
    const gap = Math.abs(pct.p1 - pct.p2);
    balanceBonus = Math.max(0, 30 - Math.round(gap * 0.55));
  }

  const liveBonus = match.status === "live-or-started" ? 8 : 0;

  return Math.min(
    100,
    Math.round(score * 0.55 + confidence * 0.25 + balanceBonus * 0.20 + liveBonus)
  );
}

function heatLabel(value) {
  if (value >= 85) return "Sehr heiß";
  if (value >= 70) return "Hohe Aufmerksamkeit";
  if (value >= 55) return "Solides Interesse";
  return "Ruhiger Markt";
}

function analysisMetrics(match) {
  const pct = marketPercentages(match);
  const confidence = marketConfidence(match);
  const heat = heatScore(match);
  const rankInfo = rankingAdvantage(match);

  if (!pct) {
    return {
      marketShape: "Unvollständig",
      risk: "Nicht bewertbar",
      balance: "Keine Daten",
      signal: "Warten",
      badge: "Daten fehlen",
      text: "Für dieses Match fehlen vollständige Quoten. Eine belastbare Markt-Einordnung ist deshalb noch nicht möglich."
    };
  }

  const gap = Math.abs(pct.p1 - pct.p2);
  const favorite = pct.p1 >= pct.p2 ? match.player1 : match.player2;
  const favoritePct = Math.max(pct.p1, pct.p2);

  let marketShape;
  if (gap <= 8) marketShape = "Sehr offen";
  else if (gap <= 20) marketShape = "Leichter Favorit";
  else if (gap <= 35) marketShape = "Klarer Favorit";
  else marketShape = "Deutlicher Favorit";

  let risk;
  if (gap <= 10) risk = "Hoch";
  else if (gap <= 25) risk = "Mittel";
  else risk = "Niedriger";

  let balance;
  if (gap <= 8) balance = "Sehr hoch";
  else if (gap <= 18) balance = "Hoch";
  else if (gap <= 30) balance = "Mittel";
  else balance = "Niedrig";

  let signal;
  if (heat >= 80 && confidence >= 85) signal = "Stark beobachten";
  else if (heat >= 65) signal = "Beobachten";
  else signal = "Kein starkes Signal";

  const badge =
    heat >= 80 ? "Starkes Signal" :
    heat >= 65 ? "Beobachten" :
    "Neutral";

  let text;

  if (gap <= 8) {
    text =
      `Der Markt bewertet ${match.player1} und ${match.player2} nahezu ausgeglichen.`;
  } else if (gap <= 20) {
    text =
      `${favorite} liegt mit rund ${favoritePct} % Marktanteil leicht vorne.`;
  } else if (gap <= 35) {
    text =
      `${favorite} ist mit rund ${favoritePct} % Marktanteil klar favorisiert.`;
  } else {
    text =
      `${favorite} wird vom Markt mit rund ${favoritePct} % sehr deutlich favorisiert.`;
  }

  if (rankInfo.available) {
    if (rankInfo.advantage === favorite) {
      text += ` Das Ranking stützt aktuell dieselbe Seite: ${rankInfo.advantage} liegt ${rankInfo.difference} Plätze vor dem Gegner.`;
    } else if (rankInfo.advantage) {
      text += ` Interessant: Der Markt favorisiert ${favorite}, das Ranking spricht dagegen für ${rankInfo.advantage} mit ${rankInfo.difference} Plätzen Vorsprung.`;
    }
  }

  text += confidence >= 90
    ? " Die vorhandenen Marktdaten sind sehr vollständig."
    : confidence >= 75
      ? " Die vorhandenen Marktdaten sind solide."
      : " Die Datenbasis ist noch begrenzt.";

  return { marketShape, risk, balance, signal, badge, text };
}

/* ------------------------------
   FILTER / RENDERING
------------------------------ */

function matchRelevant(match) {
  if (!match.startIso) return true;
  return new Date(match.startIso).getTime() > Date.now() - 4 * 60 * 60 * 1000;
}

function matchesSearch(match) {
  if (!searchTerm) return true;

  const text =
    `${match.player1} ${match.player2} ${match.event} ${match.tour}`.toLowerCase();

  return text.includes(searchTerm);
}

function selectedMatches() {
  return all
    .filter(match => {
      if (!matchRelevant(match)) return false;

      if (dayFilter === "today" && match.date !== todayString()) return false;
      if (dayFilter === "tomorrow" && match.date !== tomorrowString()) return false;

      if (filter === "ATP" && match.tour !== "ATP") return false;
      if (filter === "WTA" && match.tour !== "WTA") return false;
      if (filter === "priced" && !marketProbabilities(match)) return false;
      if (filter === "favorites" && !isFavorite(match)) return false;

      return matchesSearch(match);
    })
    .sort((a, b) => {
      const favDiff = Number(isFavorite(b)) - Number(isFavorite(a));
      if (favDiff !== 0) return favDiff;

      const heatDiff = heatScore(b) - heatScore(a);
      if (heatDiff !== 0) return heatDiff;

      return new Date(a.startIso || 0) - new Date(b.startIso || 0);
    });
}

function updateCountdown() {
  if (!selectedMatch || !$("countdown")) return;

  if (selectedMatch.status === "live-or-started") {
    $("countdown").textContent = "LIVE";
    return;
  }

  if (!selectedMatch.startIso) {
    $("countdown").textContent = "Startzeit unbekannt";
    return;
  }

  const diff = new Date(selectedMatch.startIso).getTime() - Date.now();

  if (diff <= 0) {
    $("countdown").textContent = "Startet / gestartet";
    return;
  }

  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) $("countdown").textContent = `in ${days}T ${hours}h ${minutes}m`;
  else if (hours > 0) $("countdown").textContent = `in ${hours}h ${minutes}m`;
  else $("countdown").textContent = `in ${minutes} Min`;
}

function updateLiveBadge(match) {
  if (!$("liveBadge")) return;
  $("liveBadge").classList.toggle("hidden", match.status !== "live-or-started");
}

function updateProbabilityBox(match) {
  const pct = marketPercentages(match);

  $("probName1").textContent = match.player1;
  $("probName2").textContent = match.player2;

  if (!pct) {
    $("prob1").textContent = "–";
    $("prob2").textContent = "–";
    $("probBar1").style.width = "50%";
    $("probBar2").style.width = "50%";
    $("favLabel").textContent = "Keine Quote";
    $("favPercent").textContent = "–";
    return;
  }

  $("prob1").textContent = `${pct.p1} %`;
  $("prob2").textContent = `${pct.p2} %`;
  $("probBar1").style.width = `${pct.p1}%`;
  $("probBar2").style.width = `${pct.p2}%`;

  if (pct.p1 >= pct.p2) {
    $("favLabel").textContent = match.player1;
    $("favPercent").textContent = `${pct.p1} %`;
  } else {
    $("favLabel").textContent = match.player2;
    $("favPercent").textContent = `${pct.p2} %`;
  }
}

function updateScoreBox(match) {
  const parts = scoreParts(match);
  const score = parts.total;
  const confidence = marketConfidence(match);
  const heat = heatScore(match);

  $("matchScore").textContent = score;
  $("matchScoreLabel").textContent = matchScoreLabel(score);
  $("scoreTier").textContent = matchScoreTier(score);
  $("matchScoreBar").style.width = `${score}%`;
  $("scoreRingValue").textContent = score;
  $("scoreRing").style.setProperty("--score", score);

  $("heatScore").textContent = `${heat}/100`;
  $("heatLabel").textContent = heatLabel(heat);
  $("confidenceScore").textContent = `${confidence}/100`;

  $("dataQuality").textContent = `${parts.dataQuality}/30`;
  $("balanceScore").textContent = `${parts.balance}/45`;
  $("timingScore").textContent = `${parts.timing}/15`;
  $("marketConfidence").textContent = `${confidence}/100`;

  const pct = marketPercentages(match);

  if (!pct) {
    $("scoreExplanation").textContent =
      "Für dieses Match fehlen vollständige Quoten. Der Score ist deshalb nur eingeschränkt aussagekräftig.";
    return;
  }

  const gap = Math.abs(pct.p1 - pct.p2);

  if (gap <= 10) {
    $("scoreExplanation").textContent =
      "Der Markt sieht ein sehr ausgeglichenes Duell. Das erhöht den Analysewert des Matches.";
  } else if (gap <= 25) {
    $("scoreExplanation").textContent =
      "Der Markt hat einen Favoriten, das Match bleibt aber vergleichsweise offen.";
  } else {
    $("scoreExplanation").textContent =
      "Der Markt sieht einen deutlichen Favoriten. Der Match Score beschreibt Analyse-Interesse, nicht Wettsicherheit.";
  }
}

function updateAnalysisEngine(match) {
  const metrics = analysisMetrics(match);

  $("marketShape").textContent = metrics.marketShape;
  $("riskLevel").textContent = metrics.risk;
  $("balanceLabel").textContent = metrics.balance;
  $("signalLabel").textContent = metrics.signal;
  $("engineBadge").textContent = metrics.badge;
  $("analysisText").textContent = metrics.text;
}

function showDetails(match) {
  selectedMatch = match;

  $("title").textContent = `${match.player1} vs. ${match.player2}`;
  $("meta").textContent = `${match.tour} · ${match.event}`;

  $("p1").textContent = match.player1;
  $("p2").textContent = match.player2;
  $("o1").textContent = odd(match.odds1);
  $("o2").textContent = odd(match.odds2);
  $("book1").textContent = match.bookmaker1 || "–";
  $("book2").textContent = match.bookmaker2 || "–";

  $("event").textContent = match.event || "–";
  $("start").textContent =
    `${match.date || ""} ${match.start || ""}`.trim() || "–";
  $("status").textContent = statusText(match.status);
  $("detailSource").textContent = match.source || "The Odds API";

  updateProbabilityBox(match);
  updateScoreBox(match);
  updateAnalysisEngine(match);
  updateRankingCard(match);
  updateCountdown();
  updateLiveBadge(match);
  updateFavoriteButton(match);
}

function renderHighlights() {
  const box = $("highlights");
  if (!box) return;

  box.innerHTML = "";

  const list = all
    .filter(m => m.date === todayString() && matchRelevant(m))
    .sort((a, b) => heatScore(b) - heatScore(a))
    .slice(0, 3);

  if (!list.length) {
    box.innerHTML =
      '<div class="empty">Heute keine passenden Matches gefunden.</div>';
    return;
  }

  list.forEach(match => {
    const pct = marketPercentages(match);
    const score = matchScore(match);
    const heat = heatScore(match);

    const card = document.createElement("div");
    card.className = "highlight-card";

    card.innerHTML = `
      <div class="highlight-meta">
        <span>${match.tour} · ${match.event}</span>
        <span>${match.start || ""}</span>
      </div>

      <div class="card-signal-row">
        <div class="score-chip">
          <b>${score}</b>
          <span>
            <small>Match Score</small>
            ${matchScoreTier(score)}
          </span>
        </div>
        <div class="heat-chip">Heat ${heat}</div>
      </div>

      <div class="highlight-match">
        <div><b>${match.player1}</b><span>${odd(match.odds1)}</span></div>
        <div><b>${match.player2}</b><span>${odd(match.odds2)}</span></div>
      </div>

      <div class="mini-prob">
        ${pct ? `${pct.p1} % · Markt · ${pct.p2} %` : "Keine vollständigen Quoten"}
      </div>
    `;

    card.onclick = () => showDetails(match);
    box.appendChild(card);
  });
}

function updateIntelligence() {
  const today = all.filter(m => m.date === todayString() && matchRelevant(m));

  if (!today.length) {
    $("intelBadge").textContent = "Keine Daten";
    $("intelTopMatch").textContent = "–";
    $("intelHeat").textContent = "–";
    $("intelConfidence").textContent = "–";
    $("intelMarket").textContent = "–";
    $("intelText").textContent =
      "Für heute liegen aktuell keine passenden Matches vor.";
    return;
  }

  const ranked = [...today].sort((a, b) => heatScore(b) - heatScore(a));
  const top = ranked[0];

  const pct = marketPercentages(top);
  const heat = heatScore(top);
  const confidence = marketConfidence(top);
  const rankInfo = rankingAdvantage(top);

  $("intelBadge").textContent =
    heat >= 80 ? "Starkes Signal" :
    heat >= 65 ? "Beobachten" :
    "Ruhiger Markt";

  $("intelTopMatch").textContent =
    `${top.player1} vs. ${top.player2}`;

  $("intelHeat").textContent = `${heat}/100`;
  $("intelConfidence").textContent = `${confidence}/100`;

  if (pct) {
    const gap = Math.abs(pct.p1 - pct.p2);

    $("intelMarket").textContent =
      gap <= 10 ? "Sehr offen" :
      gap <= 25 ? "Leichter Favorit" :
      "Klarer Favorit";
  } else {
    $("intelMarket").textContent = "Unvollständig";
  }

  let text =
    `Das auffälligste Match im heutigen Markt-Radar ist ${top.player1} gegen ${top.player2}. ` +
    `Heat ${heat}/100, Confidence ${confidence}/100.`;

  if (rankInfo.available && rankInfo.advantage) {
    text +=
      ` Im Ranking liegt ${rankInfo.advantage} ${rankInfo.difference} Plätze vor dem Gegner.`;
  }

  text +=
    " Die Markt- und Ranking-Einordnung ist noch keine vollständige Leistungsprognose.";

  $("intelText").textContent = text;
}

function render() {
  const matches = selectedMatches();
  const box = $("matches");

  $("count").textContent = matches.length;

  $("priced").textContent =
    matches.filter(match => Boolean(marketProbabilities(match))).length;

  box.innerHTML = "";

  if (!matches.length) {
    box.innerHTML =
      '<div class="empty">Keine passenden Matches gefunden.</div>';

    renderHighlights();
    updateMissionControl();
    updateIntelligence();
    return;
  }

  matches.forEach((match, index) => {
    const pct = marketPercentages(match);
    const score = matchScore(match);
    const heat = heatScore(match);

    const p1Fav = pct && pct.p1 >= pct.p2;
    const p2Fav = pct && pct.p2 > pct.p1;

    const card = document.createElement("article");
    card.className = `card${index === 0 ? " selected" : ""}`;

    card.innerHTML = `
      <div class="card-head">
        <div class="top">
          <div>
            <span class="tour-label">${match.tour}</span>
            <span>${match.event}</span>
          </div>

          <div class="card-actions">
            ${match.status === "live-or-started"
              ? '<span class="mini-live"><i></i>LIVE</span>'
              : ""}

            <button class="mini-favorite">
              ${isFavorite(match) ? "★" : "☆"}
            </button>

            <span>${match.start || ""}</span>
          </div>
        </div>

        <div class="card-signal-row">
          <div class="score-chip">
            <b>${score}</b>
            <span>
              <small>Match Score</small>
              ${matchScoreTier(score)}
            </span>
          </div>

          <div class="heat-chip">Heat ${heat}</div>
        </div>
      </div>

      <div class="player">
        <div>
          <strong>${p1Fav ? "★ " : ""}${match.player1}</strong>
          <small>${match.bookmaker1 || ""}</small>
        </div>

        <div class="right">
          <b>${odd(match.odds1)}</b>
          <small>${pct ? `${pct.p1} %` : ""}</small>
        </div>
      </div>

      <div class="player">
        <div>
          <strong>${p2Fav ? "★ " : ""}${match.player2}</strong>
          <small>${match.bookmaker2 || ""}</small>
        </div>

        <div class="right">
          <b>${odd(match.odds2)}</b>
          <small>${pct ? `${pct.p2} %` : ""}</small>
        </div>
      </div>

      <div class="card-footer">
        <span>${statusText(match.status)}</span>
        <span>${match.date || ""}</span>
      </div>
    `;

    card.onclick = event => {
      if (event.target.closest(".mini-favorite")) return;

      document.querySelectorAll(".card").forEach(item =>
        item.classList.remove("selected")
      );

      card.classList.add("selected");
      showDetails(match);
    };

    card.querySelector(".mini-favorite").onclick = event => {
      event.stopPropagation();
      toggleFavorite(match);
    };

    box.appendChild(card);
  });

  showDetails(matches[0]);
  renderHighlights();
  updateMissionControl();
  updateIntelligence();
}

function updateMissionControl() {
  const todayMatches = all.filter(m => m.date === todayString());
  const liveMatches = all.filter(m => m.status === "live-or-started");
  const favoriteMatches = all.filter(m => isFavorite(m));

  $("todayTotal").textContent = `${todayMatches.length} Matches`;
  $("liveTotal").textContent = `${liveMatches.length} Matches`;
  $("favTotal").textContent = `${favoriteMatches.length} Matches`;
  $("controlQuota").textContent = $("quota").textContent || "–";

  $("controlUpdated").textContent = generatedAt
    ? generatedAt.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "–";
}

/* ------------------------------
   DATEN LADEN
------------------------------ */

async function loadMatches() {
  const response = await fetch(
    `./data/matches.json?v=${Date.now()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`matches.json: HTTP ${response.status}`);
  }

  const payload = await response.json();

  all = Array.isArray(payload.matches) ? payload.matches : [];
  generatedAt = payload.generatedAt ? new Date(payload.generatedAt) : null;

  $("source").textContent = all.length
    ? "Aktuelle ATP- und WTA-Matches mit verfügbaren Quoten."
    : "Aktuell wurden keine passenden Matches gefunden.";

  $("updated").textContent = generatedAt
    ? generatedAt.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      })
    : "Noch kein Datenlauf";

  $("sysSource").textContent = payload.source || "–";
  $("tz").textContent = payload.timezone || "Europe/Berlin";
  $("quota").textContent = payload.quota?.remaining ?? "–";
}

async function loadRankings() {
  try {
    const response = await fetch(
      `./data/rankings.json?v=${Date.now()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`rankings.json: HTTP ${response.status}`);
    }

    const payload = await response.json();

    rankings = Array.isArray(payload.players) ? payload.players : [];
    rankingsGeneratedAt = payload.generatedAt || null;

  } catch (error) {
    console.warn("Rankingdaten konnten nicht geladen werden:", error);
    rankings = [];
    rankingsGeneratedAt = null;
  }
}

async function load() {
  $("updated").textContent = "Lädt …";

  try {
    await Promise.all([
      loadMatches(),
      loadRankings()
    ]);

    $("apiStatus").textContent = "Online";
    render();

  } catch (error) {
    all = [];

    $("matches").innerHTML =
      `<div class="empty">
        Daten konnten nicht geladen werden.
        <br><br>
        ${error.message}
      </div>`;

    $("updated").textContent = "Ladefehler";
    $("count").textContent = "0";
    $("priced").textContent = "0";
    $("apiStatus").textContent = "Fehler";

    updateMissionControl();
    updateIntelligence();
  }
}

/* ------------------------------
   EVENTS
------------------------------ */

document.querySelectorAll("nav button").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll("nav button").forEach(item =>
      item.classList.remove("active")
    );

    button.classList.add("active");
    filter = button.dataset.filter;
    render();
  };
});

document.querySelectorAll(".day").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".day").forEach(item =>
      item.classList.remove("active")
    );

    button.classList.add("active");
    dayFilter = button.dataset.day;
    render();
  };
});

$("search").addEventListener("input", event => {
  searchTerm = event.target.value.trim().toLowerCase();
  render();
});

$("favoriteBtn").onclick = () => {
  if (selectedMatch) toggleFavorite(selectedMatch);
};

$("controlBtn").onclick = () => {
  $("missionControl").classList.remove("hidden");
  updateMissionControl();
};

$("closeControl").onclick = () => {
  $("missionControl").classList.add("hidden");
};

$("refresh").onclick = load;

$("date").textContent =
  new Date().toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

if (countdownTimer) {
  clearInterval(countdownTimer);
}

countdownTimer = setInterval(updateCountdown, 30000);

load();
