import fs from "node:fs/promises";

const API_KEY = process.env.ODDS_API_KEY;

if (!API_KEY) {
  throw new Error("ODDS_API_KEY wurde nicht gefunden.");
}

const API = "https://api.the-odds-api.com/v4";
const TIME_ZONE = "Europe/Berlin";

function istTennis(sport) {
  const text =
    `${sport.key} ${sport.group} ${sport.title} ${sport.description || ""}`
      .toLowerCase();

  if (sport.has_outrights) return false;
  if (!text.includes("tennis")) return false;

  // Das wollen wir ausdrücklich NICHT.
  if (text.includes("challenger")) return false;
  if (text.includes("itf")) return false;
  if (text.includes("doubles")) return false;
  if (text.includes("double")) return false;

  return (
    text.includes("atp") ||
    text.includes("wta") ||
    text.includes("australian open") ||
    text.includes("french open") ||
    text.includes("roland garros") ||
    text.includes("wimbledon") ||
    text.includes("us open")
  );
}

function tour(sport) {
  const text = `${sport.key} ${sport.title}`.toLowerCase();

  if (text.includes("wta")) return "WTA";
  if (text.includes("atp")) return "ATP";

  return "Tennis";
}

function turnier(sport) {
  return sport.title
    .replace(/^Tennis\\s*[-–:]\\s*/i, "")
    .replace(/\\s+(Winner|Outrights)$/i, "")
    .trim();
}

function deutscheZeit(iso) {
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(iso));

  const get = type =>
    parts.find(part => part.type === type)?.value || "";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    start: `${get("hour")}:${get("minute")}`
  };
}

function besteQuoten(event) {
  const result = new Map();

  for (const bookmaker of event.bookmakers || []) {
    const market =
      bookmaker.markets?.find(market => market.key === "h2h");

    for (const outcome of market?.outcomes || []) {
      const bisher = result.get(outcome.name);
      const quote = Number(outcome.price);

      if (!bisher || quote > bisher.quote) {
        result.set(outcome.name, {
          quote,
          bookmaker: bookmaker.title
        });
      }
    }
  }

  return result;
}

async function laden(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `API-Fehler ${response.status}: ${await response.text()}`
    );
  }

  return {
    data: await response.json(),
    remaining: response.headers.get("x-requests-remaining"),
    used: response.headers.get("x-requests-used")
  };
}

// 1. Aktuell verfügbare Sportarten abrufen
const sportsUrl =
  `${API}/sports/?apiKey=${encodeURIComponent(API_KEY)}`;

const sportResponse = await laden(sportsUrl);

const tennisSports =
  sportResponse.data.filter(istTennis);

console.log(
  `Gefundene Tennis-Wettbewerbe: ${tennisSports.length}`
);

for (const sport of tennisSports) {
  console.log(`${sport.key} | ${sport.title}`);
}

const matches = [];

let creditsRemaining = sportResponse.remaining;
let creditsUsed = sportResponse.used;

// 2. Für jeden ATP-/WTA-Wettbewerb Quoten abrufen
for (const sport of tennisSports) {
  const url = new URL(
    `${API}/sports/${sport.key}/odds/`
  );

  url.searchParams.set("apiKey", API_KEY);
  url.searchParams.set("regions", "eu");
  url.searchParams.set("markets", "h2h");
  url.searchParams.set("oddsFormat", "decimal");
  url.searchParams.set("dateFormat", "iso");

  const response = await laden(url);

  creditsRemaining =
    response.remaining ?? creditsRemaining;

  creditsUsed =
    response.used ?? creditsUsed;

  for (const event of response.data) {
    const zeit = deutscheZeit(event.commence_time);
    const quoten = besteQuoten(event);

    const q1 = quoten.get(event.home_team);
    const q2 = quoten.get(event.away_team);

    matches.push({
      id: event.id,

      tour: tour(sport),
      event: turnier(sport),

      date: zeit.date,
      start: zeit.start,
      startIso: event.commence_time,

      status:
        new Date(event.commence_time) <= new Date()
          ? "live-or-started"
          : "upcoming",

      player1: event.home_team,
      player2: event.away_team,

      odds1: q1?.quote ?? null,
      odds2: q2?.quote ?? null,

      bookmaker1: q1?.bookmaker ?? null,
      bookmaker2: q2?.bookmaker ?? null,

      source: "The Odds API"
    });
  }
}

// Doppelte Events entfernen
const uniqueMatches = [
  ...new Map(
    matches.map(match => [match.id, match])
  ).values()
].sort(
  (a, b) =>
    new Date(a.startIso) - new Date(b.startIso)
);

const output = {
  generatedAt: new Date().toISOString(),

  source: "The Odds API",

  timezone: TIME_ZONE,

  quota: {
    used: creditsUsed,
    remaining: creditsRemaining
  },

  matches: uniqueMatches
};

await fs.writeFile(
  "./data/matches.json",
  JSON.stringify(output, null, 2),
  "utf8"
);

console.log(
  `FERTIG: ${uniqueMatches.length} Matches gespeichert.`
);
