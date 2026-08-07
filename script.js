let allMatches = [];
let currentFilter = "all";

const $ = id => document.getElementById(id);

function formatOdds(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toFixed(2).replace(".", ",")
    : "–";
}

function statusLabel(value) {
  if (value === "upcoming") return "Bevorstehend";
  if (value === "live-or-started") return "Läuft / gestartet";
  return value || "Unbekannt";
}

function filteredMatches() {
  return allMatches.filter(match => {
    if (currentFilter === "all") return true;

    if (currentFilter === "priced") {
      return (
        Number.isFinite(Number(match.odds1)) &&
        Number.isFinite(Number(match.odds2))
      );
    }

    return match.tour === currentFilter;
  });
}

function showDetails(match) {
  $("detailTitle").textContent =
    `${match.player1} vs. ${match.player2}`;

  $("detailMeta").textContent =
    `${match.tour} · ${match.event}`;

  $("detailP1").textContent = match.player1;
  $("detailP2").textContent = match.player2;

  $("detailO1").textContent = formatOdds(match.odds1);
  $("detailO2").textContent = formatOdds(match.odds2);

  $("detailEvent").textContent =
    match.event || "–";

  $("detailStart").textContent =
    `${match.date || ""} ${match.start || ""}`.trim() || "–";

  $("detailStatus").textContent =
    statusLabel(match.status);

  $("detailSource").textContent =
    match.source || "The Odds API";
}

function renderMatches() {
  const matches = filteredMatches();
  const list = $("matchList");

  list.innerHTML = "";

  $("matchCount").textContent = matches.length;

  $("pricedCount").textContent =
    matches.filter(match =>
      Number.isFinite(Number(match.odds1)) &&
      Number.isFinite(Number(match.odds2))
    ).length;

  if (!matches.length) {
    list.innerHTML =
      `<div class="empty">
        Für diesen Filter sind aktuell keine Matches vorhanden.
      </div>`;
    return;
  }

  matches.forEach((match, index) => {
    const card = document.createElement("article");

    card.className =
      `match-card${index === 0 ? " selected" : ""}`;

    card.innerHTML = `
      <div class="match-head">
        <span class="match-meta">
          ${match.tour} · ${match.event} · ${match.start || ""}
        </span>

        <span class="badge">
          ${statusLabel(match.status)}
        </span>
      </div>

      <div class="player-row">
        <span class="player">${match.player1}</span>
        <span class="price">${formatOdds(match.odds1)}</span>
      </div>

      <div class="player-row">
        <span class="player">${match.player2}</span>
        <span class="price">${formatOdds(match.odds2)}</span>
      </div>
    `;

    card.onclick = () => {
      document
        .querySelectorAll(".match-card")
        .forEach(item => item.classList.remove("selected"));

      card.classList.add("selected");

      showDetails(match);
    };

    list.appendChild(card);
  });

  showDetails(matches[0]);
}

async function loadMatches() {
  $("updatedAt").textContent =
    "Daten werden geladen …";

  try {
    const response = await fetch(
      `./data/matches.json?v=${Date.now()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();

    allMatches =
      Array.isArray(payload.matches)
        ? payload.matches
        : [];

    const generated =
      payload.generatedAt
        ? new Date(payload.generatedAt)
        : null;

    $("sourceText").textContent =
      allMatches.length
        ? "Aktuelle ATP- und WTA-Matches mit verfügbaren Quoten."
        : "Aktuell wurden keine passenden Matches gefunden.";

    $("updatedAt").textContent =
      generated
        ? generated.toLocaleString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          })
        : "Noch kein Datenlauf";

    $("statusSource").textContent =
      payload.source || "–";

    $("statusTimezone").textContent =
      payload.timezone || "Europe/Berlin";

    $("statusQuota").textContent =
      payload.quota?.remaining ?? "–";

    renderMatches();

  } catch (error) {
    allMatches = [];

    $("matchList").innerHTML =
      `<div class="empty">
        Daten konnten nicht geladen werden.<br>
        ${error.message}
      </div>`;

    $("updatedAt").textContent =
      "Ladefehler";

    $("matchCount").textContent = "0";
    $("pricedCount").textContent = "0";
  }
}

document
  .querySelectorAll(".filter")
  .forEach(button => {

    button.onclick = () => {

      document
        .querySelectorAll(".filter")
        .forEach(item =>
          item.classList.remove("active")
        );

      button.classList.add("active");

      currentFilter =
        button.dataset.filter;

      renderMatches();
    };
  });

$("refreshBtn").onclick =
  loadMatches;

$("dateTitle").textContent =
  new Date().toLocaleDateString(
    "de-DE",
    {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );

loadMatches();
