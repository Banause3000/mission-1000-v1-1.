let all = [];
let filter = "all";

const $ = id => document.getElementById(id);

const odd = value =>
  Number.isFinite(Number(value))
    ? Number(value).toFixed(2).replace(".", ",")
    : "–";

const statusText = value => {
  if (value === "upcoming") return "Bevorstehend";
  if (value === "live-or-started") return "Läuft / gestartet";
  return value || "Unbekannt";
};

function selectedMatches() {
  return all.filter(match => {
    if (filter === "all") return true;

    if (filter === "priced") {
      return (
        Number.isFinite(Number(match.odds1)) &&
        Number.isFinite(Number(match.odds2))
      );
    }

    return match.tour === filter;
  });
}

function showDetails(match) {
  $("title").textContent =
    `${match.player1} vs. ${match.player2}`;

  $("meta").textContent =
    `${match.tour} · ${match.event}`;

  $("p1").textContent = match.player1;
  $("p2").textContent = match.player2;

  $("o1").textContent = odd(match.odds1);
  $("o2").textContent = odd(match.odds2);

  $("event").textContent =
    match.event || "–";

  $("start").textContent =
    `${match.date || ""} ${match.start || ""}`.trim() || "–";

  $("status").textContent =
    statusText(match.status);

  $("detailSource").textContent =
    match.source || "The Odds API";
}

function render() {
  const matches = selectedMatches();
  const box = $("matches");

  box.innerHTML = "";

  $("count").textContent = matches.length;

  $("priced").textContent =
    matches.filter(match =>
      Number.isFinite(Number(match.odds1)) &&
      Number.isFinite(Number(match.odds2))
    ).length;

  if (!matches.length) {
    box.innerHTML = `
      <div class="empty">
        Für diesen Filter sind aktuell keine Matches vorhanden.
      </div>
    `;
    return;
  }

  matches.forEach((match, index) => {
    const card = document.createElement("article");

    card.className =
      `card${index === 0 ? " selected" : ""}`;

    card.innerHTML = `
      <div class="top">
        <span>
          ${match.tour} · ${match.event} ·
          ${match.date || ""} ${match.start || ""}
        </span>

        <span>
          ${statusText(match.status)}
        </span>
      </div>

      <div class="player">
        <span>${match.player1}</span>
        <b>${odd(match.odds1)}</b>
      </div>

      <div class="player">
        <span>${match.player2}</span>
        <b>${odd(match.odds2)}</b>
      </div>
    `;

    card.onclick = () => {
      document
        .querySelectorAll(".card")
        .forEach(item =>
          item.classList.remove("selected")
        );

      card.classList.add("selected");

      showDetails(match);
    };

    box.appendChild(card);
  });

  showDetails(matches[0]);
}

async function load() {
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

    all =
      Array.isArray(payload.matches)
        ? payload.matches
        : [];

    const generated =
      payload.generatedAt
        ? new Date(payload.generatedAt)
        : null;

    $("source").textContent =
      all.length
        ? "Aktuelle ATP- und WTA-Matches mit verfügbaren Quoten."
        : "Aktuell wurden keine passenden Matches gefunden.";

    $("updated").textContent =
      generated
        ? generated.toLocaleString(
            "de-DE",
            {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            }
          )
        : "Noch kein Datenlauf";

    $("sysSource").textContent =
      payload.source || "–";

    $("tz").textContent =
      payload.timezone || "Europe/Berlin";

    $("quota").textContent =
      payload.quota?.remaining ?? "–";

    render();

  } catch (error) {
    all = [];

    $("matches").innerHTML = `
      <div class="empty">
        Daten konnten nicht geladen werden.<br>
        ${error.message}
      </div>
    `;

    $("updated").textContent = "Ladefehler";
    $("count").textContent = "0";
    $("priced").textContent = "0";
  }
}

document
  .querySelectorAll("nav button")
  .forEach(button => {

    button.onclick = () => {

      document
        .querySelectorAll("nav button")
        .forEach(item =>
          item.classList.remove("active")
        );

      button.classList.add("active");

      filter = button.dataset.filter;

      render();
    };
  });

$("refresh").onclick = load;

$("date").textContent =
  new Date().toLocaleDateString(
    "de-DE",
    {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );

load();
