let currentFilter = "all";
let MATCHES = [];
let LADDER = [];

const $ = id => document.getElementById(id);
const formatOdds = value => Number(value).toFixed(2).replace(".", ",");
const formatValue = value => `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1).replace(".", ",")} %`;

async function loadMatches() {
  $("lastUpdated").textContent = "Daten werden geladen …";
  try {
    const response = await fetch(`./data/matches.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    MATCHES = Array.isArray(payload.matches) ? payload.matches : [];
    LADDER = MATCHES.filter(m => m.topPick).slice(0, 5).map(m => ({
      time: m.start,
      label: m.pick,
      odds: formatOdds(m.marketOdds)
    }));
    const generated = payload.generatedAt ? new Date(payload.generatedAt) : new Date();
    $("lastUpdated").textContent =
      `${payload.source === "demo" ? "Demo · " : ""}${generated.toLocaleString("de-DE", {day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}`;
    render();
    renderLadder();
  } catch (error) {
    MATCHES = [];
    $("matchList").innerHTML = `<div class="empty">Daten konnten nicht geladen werden.<br><small>${error.message}</small></div>`;
    $("lastUpdated").textContent = "Ladefehler";
  }
}

function filtered() {
  return MATCHES.filter(m =>
    currentFilter === "all" ||
    (currentFilter === "top" && m.topPick) ||
    m.tour === currentFilter
  );
}

function show(m) {
  $("detailTitle").textContent = `${m.player1} vs. ${m.player2}`;
  $("detailMeta").textContent = `${m.tour} · ${m.event} · Start ${m.start}`;
  $("probabilityText").textContent = `${m.probability} %`;
  $("probabilityBar").style.width = `${m.probability}%`;
  $("fairOdds").textContent = formatOdds(m.fairOdds);
  $("marketOdds").textContent = formatOdds(m.marketOdds);
  $("valueText").textContent = formatValue(m.value);
  $("confidence").textContent = `${m.confidence} / 100`;
  $("recommendation").textContent = m.pick;
  $("reasons").innerHTML = (m.reasons || []).map((reason, index) =>
    `<div class="reason"><span class="dot${index === m.reasons.length - 1 ? " risk" : ""}"></span><span>${reason}</span></div>`
  ).join("");
}

function render() {
  const list = $("matchList");
  const matches = filtered();
  list.innerHTML = "";
  $("matchCount").textContent = matches.length;
  $("pickCount").textContent = matches.filter(m => m.topPick).length;

  matches.forEach((m, index) => {
    const card = document.createElement("article");
    card.className = `match${index === 0 ? " selected" : ""}`;
    card.innerHTML = `
      <div class="match-top">
        <span class="match-meta">${m.tour} · ${m.event} · ${m.start}</span>
        <span class="badge">${m.topPick ? "Top-Pick" : "Analyse"}</span>
      </div>
      <div class="player"><span class="player-name">${m.player1}</span><span class="odds">${formatOdds(m.odds1)}</span></div>
      <div class="player"><span class="player-name">${m.player2}</span><span class="odds">${formatOdds(m.odds2)}</span></div>
      <div class="pick-row"><span>Empfehlung: <strong>${m.pick}</strong></span><span>${m.probability} %</span></div>`;
    card.onclick = () => {
      document.querySelectorAll(".match").forEach(x => x.classList.remove("selected"));
      card.classList.add("selected");
      show(m);
    };
    list.appendChild(card);
  });

  if (matches[0]) show(matches[0]);
}

function renderLadder() {
  $("ladderList").innerHTML = LADDER.length
    ? LADDER.map(x => `<div class="ladder-item"><span class="ladder-time">${x.time}</span><span>${x.label}</span><span class="ladder-odds">${x.odds}</span></div>`).join("")
    : `<div class="empty">Keine zeitlich passenden Top-Picks vorhanden.</div>`;
}

document.querySelectorAll(".filters button").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".filters button").forEach(x => x.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    render();
  };
});

$("refreshButton").onclick = loadMatches;
$("todayTitle").textContent = new Date().toLocaleDateString("de-DE", {
  weekday: "long", day: "2-digit", month: "2-digit", year: "numeric"
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js"));
}

loadMatches();
