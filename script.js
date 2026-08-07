let all = [];

let filter = "all";
let dayFilter = "today";
let searchTerm = "";

const $ = id =>
  document.getElementById(id);


function odd(value) {

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
        .toFixed(2)
        .replace(".", ",")
    : "–";
}


function statusText(status) {

  if (status === "upcoming") {
    return "Bevorstehend";
  }

  if (status === "live-or-started") {
    return "LIVE / gestartet";
  }

  if (status === "completed") {
    return "Beendet";
  }

  return status || "Unbekannt";
}


function localDayString(date) {

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function todayString() {

  return localDayString(
    new Date()
  );
}


function tomorrowString() {

  const d =
    new Date();

  d.setDate(
    d.getDate() + 1
  );

  return localDayString(d);
}


function marketProbabilities(match) {

  const o1 =
    Number(match.odds1);

  const o2 =
    Number(match.odds2);

  if (
    !Number.isFinite(o1) ||
    !Number.isFinite(o2) ||
    o1 <= 1 ||
    o2 <= 1
  ) {
    return null;
  }

  const raw1 =
    1 / o1;

  const raw2 =
    1 / o2;

  const total =
    raw1 + raw2;

  return {
    p1:
      raw1 / total,

    p2:
      raw2 / total
  };
}


function marketPercentages(match) {

  const probs =
    marketProbabilities(
      match
    );

  if (!probs) {
    return null;
  }

  const p1 =
    Math.round(
      probs.p1 * 100
    );

  const p2 =
    100 - p1;

  return {
    p1,
    p2
  };
}


function matchScore(match) {

  const pct =
    marketPercentages(
      match
    );

  let score = 0;


  /*
    1. Datenqualität
    Beide Quoten vorhanden:
    bis zu 30 Punkte
  */

  if (
    Number.isFinite(
      Number(match.odds1)
    )
  ) {
    score += 15;
  }

  if (
    Number.isFinite(
      Number(match.odds2)
    )
  ) {
    score += 15;
  }


  /*
    2. Ausgeglichenheit des Marktes
    Ein 50:50 Match ist analytisch
    interessanter als 90:10.
    Bis zu 45 Punkte.
  */

  if (pct) {

    const difference =
      Math.abs(
        pct.p1 -
        pct.p2
      );

    const closeness =
      Math.max(
        0,
        50 - difference
      );

    score +=
      Math.round(
        closeness * 0.9
      );
  }


  /*
    3. Zeitliche Relevanz
    Heute = 15 Punkte
    Morgen = 10 Punkte
  */

  if (
    match.date ===
    todayString()
  ) {
    score += 15;
  }

  else if (
    match.date ===
    tomorrowString()
  ) {
    score += 10;
  }


  /*
    4. Turnierzuordnung vorhanden
  */

  if (
    match.event &&
    match.event !== "–"
  ) {
    score += 5;
  }


  /*
    5. ATP/WTA sauber erkannt
  */

  if (
    match.tour === "ATP" ||
    match.tour === "WTA"
  ) {
    score += 5;
  }


  return Math.min(
    100,
    score
  );
}


function matchScoreLabel(score) {

  if (score >= 85) {
    return "Sehr interessant";
  }

  if (score >= 70) {
    return "Interessant";
  }

  if (score >= 55) {
    return "Beobachten";
  }

  return "Niedrige Priorität";
}


function matchRelevant(match) {

  if (!match.startIso) {
    return true;
  }

  const start =
    new Date(
      match.startIso
    ).getTime();

  const fourHours =
    4 *
    60 *
    60 *
    1000;

  return (
    start >
    Date.now() -
    fourHours
  );
}


function searchMatches(match) {

  if (!searchTerm) {
    return true;
  }

  const text =
    `
      ${match.player1}
      ${match.player2}
      ${match.event}
      ${match.tour}
    `
      .toLowerCase();

  return text.includes(
    searchTerm
  );
}


function selectedMatches() {

  return all
    .filter(match => {

      if (
        !matchRelevant(match)
      ) {
        return false;
      }


      if (
        dayFilter === "today" &&
        match.date !== todayString()
      ) {
        return false;
      }


      if (
        dayFilter === "tomorrow" &&
        match.date !== tomorrowString()
      ) {
        return false;
      }


      if (
        filter === "ATP" &&
        match.tour !== "ATP"
      ) {
        return false;
      }


      if (
        filter === "WTA" &&
        match.tour !== "WTA"
      ) {
        return false;
      }


      if (
        filter === "priced" &&
        !marketProbabilities(match)
      ) {
        return false;
      }


      if (
        !searchMatches(match)
      ) {
        return false;
      }


      return true;

    })

    .sort(
      (a, b) => {

        const scoreA =
          matchScore(a);

        const scoreB =
          matchScore(b);

        if (
          scoreB !== scoreA
        ) {
          return (
            scoreB -
            scoreA
          );
        }

        return (
          new Date(
            a.startIso || 0
          ) -
          new Date(
            b.startIso || 0
          )
        );
      }
    );
}


function interestingMatches() {

  return all
    .filter(match => {

      if (
        match.date !==
        todayString()
      ) {
        return false;
      }

      if (
        !matchRelevant(match)
      ) {
        return false;
      }

      return Boolean(
        marketProbabilities(
          match
        )
      );
    })

    .sort(
      (a, b) =>
        matchScore(b) -
        matchScore(a)
    )

    .slice(
      0,
      3
    );
}


function renderHighlights() {

  const box =
    $("highlights");

  if (!box) {
    return;
  }

  box.innerHTML = "";

  const list =
    interestingMatches();


  if (!list.length) {

    box.innerHTML =
      `
      <div class="empty">
        Heute keine passenden
        Matches mit Quoten gefunden.
      </div>
      `;

    return;
  }


  list.forEach(
    match => {

      const pct =
        marketPercentages(
          match
        );

      const score =
        matchScore(
          match
        );

      const label =
        matchScoreLabel(
          score
        );


      const card =
        document.createElement(
          "div"
        );

      card.className =
        "highlight-card";


      card.innerHTML =
        `

        <div class="highlight-meta">

          <span>
            ${match.tour}
            ·
            ${match.event}
          </span>

          <span>
            ${match.start || ""}
          </span>

        </div>


        <div class="highlight-match">

          <div>

            <b>
              ${match.player1}
            </b>

            <span>
              ${odd(
                match.odds1
              )}
            </span>

          </div>


          <div>

            <b>
              ${match.player2}
            </b>

            <span>
              ${odd(
                match.odds2
              )}
            </span>

          </div>

        </div>


        <div class="mini-prob">

          ${
            pct
              ? `${pct.p1} % · Markt · ${pct.p2} %`
              : "Keine Marktwahrscheinlichkeit"
          }

        </div>


        <div class="highlight-score">

          <span>
            Match Score
          </span>

          <b>
            ${score}
          </b>

          <small>
            ${label}
          </small>

        </div>
        `;


      card.onclick =
        () =>
          showDetails(
            match
          );


      box.appendChild(
        card
      );

    }
  );
}


function updateProbabilityBox(match) {

  const pct =
    marketPercentages(
      match
    );


  const probName1 =
    $("probName1");

  const probName2 =
    $("probName2");

  const prob1 =
    $("prob1");

  const prob2 =
    $("prob2");

  const probBar1 =
    $("probBar1");

  const probBar2 =
    $("probBar2");

  const favLabel =
    $("favLabel");


  if (
    !probName1 ||
    !probName2 ||
    !prob1 ||
    !prob2 ||
    !probBar1 ||
    !probBar2 ||
    !favLabel
  ) {
    return;
  }


  probName1.textContent =
    match.player1;

  probName2.textContent =
    match.player2;


  if (!pct) {

    prob1.textContent =
      "–";

    prob2.textContent =
      "–";

    probBar1.style.width =
      "50%";

    probBar2.style.width =
      "50%";

    favLabel.textContent =
      "Keine Quote";

    return;
  }


  prob1.textContent =
    `${pct.p1} %`;

  prob2.textContent =
    `${pct.p2} %`;


  probBar1.style.width =
    `${pct.p1}%`;

  probBar2.style.width =
    `${pct.p2}%`;


  favLabel.textContent =
    pct.p1 >= pct.p2
      ? `${match.player1} Favorit`
      : `${match.player2} Favorit`;
}


function updateScoreBox(match) {

  const score =
    matchScore(
      match
    );

  const label =
    matchScoreLabel(
      score
    );


  if (
    $("matchScore")
  ) {
    $("matchScore").textContent =
      score;
  }


  if (
    $("matchScoreLabel")
  ) {
    $("matchScoreLabel").textContent =
      label;
  }


  if (
    $("matchScoreBar")
  ) {
    $("matchScoreBar").style.width =
      `${score}%`;
  }
}


function showDetails(match) {

  if ($("title")) {
    $("title").textContent =
      `${match.player1} vs. ${match.player2}`;
  }


  if ($("meta")) {
    $("meta").textContent =
      `${match.tour} · ${match.event}`;
  }


  if ($("p1")) {
    $("p1").textContent =
      match.player1;
  }


  if ($("p2")) {
    $("p2").textContent =
      match.player2;
  }


  if ($("o1")) {
    $("o1").textContent =
      odd(
        match.odds1
      );
  }


  if ($("o2")) {
    $("o2").textContent =
      odd(
        match.odds2
      );
  }


  if ($("book1")) {
    $("book1").textContent =
      match.bookmaker1 ||
      "–";
  }


  if ($("book2")) {
    $("book2").textContent =
      match.bookmaker2 ||
      "–";
  }


  if ($("event")) {
    $("event").textContent =
      match.event ||
      "–";
  }


  if ($("start")) {
    $("start").textContent =
      `${match.date || ""} ${match.start || ""}`
        .trim() ||
      "–";
  }


  if ($("status")) {
    $("status").textContent =
      statusText(
        match.status
      );
  }


  if ($("detailSource")) {
    $("detailSource").textContent =
      match.source ||
      "The Odds API";
  }


  updateProbabilityBox(
    match
  );

  updateScoreBox(
    match
  );
}


function render() {

  const matches =
    selectedMatches();


  const box =
    $("matches");


  if (!box) {
    return;
  }


  box.innerHTML = "";


  if ($("count")) {
    $("count").textContent =
      matches.length;
  }


  if ($("priced")) {

    $("priced").textContent =
      matches.filter(
        match =>
          Boolean(
            marketProbabilities(
              match
            )
          )
      ).length;
  }


  if (!matches.length) {

    box.innerHTML =
      `
      <div class="empty">
        Keine passenden
        Matches gefunden.
      </div>
      `;

    return;
  }


  matches.forEach(
    (
      match,
      index
    ) => {

      const pct =
        marketPercentages(
          match
        );

      const score =
        matchScore(
          match
        );

      const label =
        matchScoreLabel(
          score
        );


      const p1IsFav =
        pct &&
        pct.p1 >= pct.p2;

      const p2IsFav =
        pct &&
        pct.p2 > pct.p1;


      const card =
        document.createElement(
          "article"
        );


      card.className =
        `card${
          index === 0
            ? " selected"
            : ""
        }`;


      card.innerHTML =
        `

        <div class="top">

          <div>

            <span class="tour-label">
              ${match.tour}
            </span>

            <span>
              ${match.event}
            </span>

          </div>


          <span>
            ${match.start || ""}
          </span>

        </div>


        <div class="score-chip">

          <span>
            Match Score
          </span>

          <b>
            ${score}
          </b>

          <small>
            ${label}
          </small>

        </div>


        <div class="player">

          <div>

            <strong>
              ${
                p1IsFav
                  ? "★ "
                  : ""
              }
              ${match.player1}
            </strong>

            <small>
              ${match.bookmaker1 || ""}
            </small>

          </div>


          <div class="right">

            <b>
              ${odd(
                match.odds1
              )}
            </b>

            <small>
              ${
                pct
                  ? `${pct.p1} %`
                  : ""
              }
            </small>

          </div>

        </div>


        <div class="player">

          <div>

            <strong>
              ${
                p2IsFav
                  ? "★ "
                  : ""
              }
              ${match.player2}
            </strong>

            <small>
              ${match.bookmaker2 || ""}
            </small>

          </div>


          <div class="right">

            <b>
              ${odd(
                match.odds2
              )}
            </b>

            <small>
              ${
                pct
                  ? `${pct.p2} %`
                  : ""
              }
            </small>

          </div>

        </div>


        <div class="card-footer">

          <span>
            ${statusText(
              match.status
            )}
          </span>

          <span>
            ${match.date || ""}
          </span>

        </div>
        `;


      card.onclick =
        () => {

          document
            .querySelectorAll(
              ".card"
            )
            .forEach(
              item =>
                item.classList.remove(
                  "selected"
                )
            );


          card.classList.add(
            "selected"
          );


          showDetails(
            match
          );
        };


      box.appendChild(
        card
      );

    }
  );


  showDetails(
    matches[0]
  );
}


async function load() {

  if ($("updated")) {
    $("updated").textContent =
      "Lädt …";
  }


  try {

    const response =
      await fetch(
        `./data/matches.json?v=${Date.now()}`,
        {
          cache:
            "no-store"
        }
      );


    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }


    const payload =
      await response.json();


    all =
      Array.isArray(
        payload.matches
      )
        ? payload.matches
        : [];


    const generated =
      payload.generatedAt
        ? new Date(
            payload.generatedAt
          )
        : null;


    if ($("source")) {

      $("source").textContent =
        all.length
          ? "Aktuelle ATP- und WTA-Matches mit verfügbaren Quoten."
          : "Aktuell wurden keine passenden Matches gefunden.";
    }


    if ($("updated")) {

      $("updated").textContent =
        generated
          ? generated.toLocaleString(
              "de-DE",
              {
                day:
                  "2-digit",

                month:
                  "2-digit",

                hour:
                  "2-digit",

                minute:
                  "2-digit"
              }
            )
          : "Noch kein Datenlauf";
    }


    if ($("sysSource")) {
      $("sysSource").textContent =
        payload.source ||
        "–";
    }


    if ($("tz")) {
      $("tz").textContent =
        payload.timezone ||
        "Europe/Berlin";
    }


    if ($("quota")) {
      $("quota").textContent =
        payload.quota
          ?.remaining ??
        "–";
    }


    renderHighlights();
    render();

  }

  catch(error) {

    all = [];


    if ($("matches")) {

      $("matches").innerHTML =
        `
        <div class="empty">

          Daten konnten nicht
          geladen werden.

          <br><br>

          ${error.message}

        </div>
        `;
    }


    if ($("updated")) {
      $("updated").textContent =
        "Ladefehler";
    }


    if ($("count")) {
      $("count").textContent =
        "0";
    }


    if ($("priced")) {
      $("priced").textContent =
        "0";
    }

  }
}


document
  .querySelectorAll(
    "nav button"
  )
  .forEach(
    button => {

      button.onclick =
        () => {

          document
            .querySelectorAll(
              "nav button"
            )
            .forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );


          button.classList.add(
            "active"
          );


          filter =
            button.dataset.filter;


          render();
        };
    }
  );


document
  .querySelectorAll(
    ".day"
  )
  .forEach(
    button => {

      button.onclick =
        () => {

          document
            .querySelectorAll(
              ".day"
            )
            .forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );


          button.classList.add(
            "active"
          );


          dayFilter =
            button.dataset.day;


          render();
        };
    }
  );


const search =
  $("search");


if (search) {

  search.addEventListener(
    "input",
    event => {

      searchTerm =
        event.target.value
          .trim()
          .toLowerCase();


      render();

    }
  );
}


if ($("refresh")) {

  $("refresh").onclick =
    load;
}


if ($("date")) {

  $("date").textContent =
    new Date()
      .toLocaleDateString(
        "de-DE",
        {
          weekday:
            "long",

          day:
            "2-digit",

          month:
            "2-digit",

          year:
            "numeric"
        }
      );
}


load();
