let currentFilter = "all";
let MATCHES = [];

const $ = id => document.getElementById(id);

function formatOdds(value) {
  return Number.isFinite(Number(value))
    ? Number(value).toFixed(2).replace(".", ",")
    : "–";
}

function formatMetric(value, suffix = "") {
  return Number.isFinite(Number(value)) ? `${value}${suffix}` : "Noch offen";
}

async function loadMatches() {
  $("lastUpdated").textContent = "Daten werden geladen …";

  try {
    const response = await fetch(`./data/matches.json?v=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    MATCHES = Array.isArray(payload.matches) ? payload.matches : [];

    const generated = payload.generatedAt ? new Date(payload.generatedAt) : new Date();
    $("lastUpdated").textContent =
      `${payload.source ?? "Daten"} · ${generated.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      })}`;

    render();
    renderLadder();
  } catch (error) {
    MATCHES = [];
    $("matchCount").textContent = "0";
    $("pickCount").textContent = "0";
    $("matchList").innerHTML =
      `<div class="empty">Daten konnten nicht geladen werden.<br><small>${error.message}</small></div>`;
    $("lastUpdated").textContent = "Ladefehler";
  }
}

function filteredMatches() {
  return MATCHES.filter(match => {
    if (currentFilter === "all") return true;
    if (currentFilter === "top") return match.topPick === true;
    return match.tour === currentFilter;
  });
}

function recommendationText(match) {
  return match.pick || "Noch keine Modellprognose";
}

function showMatch(match) {
  $("detailTitle").textContent = `${match.player1} vs. ${match.player2}`;
  $("detailMeta").textContent =
    `${match.tour} · ${match.event} · ${match.date ?? ""} ${match.start}`;

  const probability = Number(match.probability);
  $("probabilityText").textContent = Number.isFinite(probability)
    ? `${probability} %`
    : "Noch offen";
  $("probabilityBar").style.width = Number.isFinite(probability)
    ? `${probability}%`
    : "0%";

  $("fairOdds").textContent = formatOdds(match.fairOdds);
  $("marketOdds").textContent = formatOdds(
    match.marketOdds ?? Math.max(Number(match.odds1) || 0, Number(match.odds2) || 0)
  );
  $("valueText").textContent = Number.isFinite(Number(match.value))
    ? `${Number(match.value) >= 0 ? "+" : ""}${Number(match.value).toFixed(1).replace(".", ",")} %`
    : "Noch offen";
  $("confidence").textContent = Number.isFinite(Number(match.confidence))
    ? `${match.confidence} / 100`
    : "Noch offen";
  $("recommendation").textContent = recommendationText(match);

  $("reasons").innerHTML = (match.reasons || []).map((reason, index) =>
    `<div class="reason">
      <span class="dot${index === (match.reasons || []).length - 1 ? " risk" : ""}"></span>
      <span>${reason}</span>
    </div>`
  ).join("");
}

function render() {
  const list = $("matchList");
  const matches = filteredMatches();

  list.innerHTML = "";
  $("matchCount").textContent = matches.length;
  $("pickCount").textContent = matches.filter(match => match.topPick).length;

  if (!matches.length) {
    list.innerHTML = `<div class="empty">Für diesen Filter sind aktuell keine Matches vorhanden.</div>`;
    return;
  }

  matches.forEach((match, index) => {
    const card = document.createElement("article");
    card.className = `match${index === 0 ? " selected" : ""}`;

    card.innerHTML = `
      <div class="match-top">
        <span class="match-meta">${match.tour} · ${match.event} · ${match.start}</span>
        <span class="badge">${match.topPick ? "Top-Pick" : "Match"}</span>
      </div>
      <div class="player">
        <span class="player-name">${match.player1}</span>
        <span class="odds">${formatOdds(match.odds1)}</span>
      </div>
      <div class="player">
        <span class="player-name">${match.player2}</span>
        <span class="odds">${formatOdds(match.odds2)}</span>
      </div>
      <div class="pick-row">
        <span>Analyse: <strong>${recommendationText(match)}</strong></span>
        <span>${Number.isFinite(Number(match.probability)) ? `${match.probability} %` : "ausstehend"}</span>
      </div>`;

    card.onclick = () => {
      document.querySelectorAll(".match").forEach(item => item.classList.remove("selected"));
      card.classList.add("selected");
      showMatch(match);
    };

    list.appendChild(card);
  });

  showMatch(matches[0]);
}

function renderLadder() {
  const picks = MATCHES
    .filter(match => match.topPick && match.pick)
    .sort((a, b) => new Date(a.startIso) - new Date(b.startIso))
    .slice(0, 5);

  $("ladderList").innerHTML = picks.length
    ? picks.map(match => `
        <div class="ladder-item">
          <span class="ladder-time">${match.start}</span>
          <span>${match.pick}</span>
          <span class="ladder-odds">${formatOdds(match.marketOdds)}</span>
        </div>`).join("")
    : `<div class="empty">Noch keine modellbasierten Leiter-Picks vorhanden.</div>`;
}

document.querySelectorAll(".filters button").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".filters button").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    render();
  };
});

$("refreshButton").onclick = loadMatches;

$("todayTitle").textContent = new Date().toLocaleDateString("de-DE", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./service-worker.js")
  );
}

loadMatches();
