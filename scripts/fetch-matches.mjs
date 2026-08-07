import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.ODDS_API_KEY;
if (!API_KEY) {
  throw new Error("ODDS_API_KEY fehlt.");
}

const API_BASE = "https://api.the-odds-api.com/v4";
const TIME_ZONE = "Europe/Berlin";

/**
 * Diese API deckt aktuell vor allem Grand Slams, ATP 500/1000 und WTA 500/1000 ab.
 * Challenger und Outrights werden bewusst ausgeschlossen.
 */
function isWantedTennisSport(sport) {
  const text = `${sport.key} ${sport.group} ${sport.title} ${sport.description ?? ""}`.toLowerCase();

  if (!text.includes("tennis")) return false;
  if (sport.has_outrights) return false;
  if (text.includes("challenger")) return false;
  if (text.includes("itf")) return false;
  if (text.includes("doubles") || text.includes("double")) return false;

  return text.includes("atp") ||
    text.includes("wta") ||
    text.includes("australian open") ||
    text.includes("french open") ||
    text.includes("roland garros") ||
    text.includes("wimbledon") ||
    text.includes("us open");
}

function localParts(isoDate) {
  const date = new Date(isoDate);
  const parts = new Intl.DateTimeFormat("de-DE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);

  const get = type => parts.find(part => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`
  };
}

function tourFromSport(sport) {
  const text = `${sport.key} ${sport.group} ${sport.title}`.toLowerCase();
  if (text.includes("wta")) return "WTA";
  if (text.includes("atp")) return "ATP";
  return "Tennis";
}

function tournamentName(sport) {
  return sport.title
    .replace(/^Tennis\s*[-–:]\s*/i, "")
    .replace(/\s+(Winner|Outrights)$/i, "")
    .trim();
}

function bestPrices(event) {
  const prices = new Map();

  for (const bookmaker of event.bookmakers ?? []) {
    const market = bookmaker.markets?.find(item => item.key === "h2h");
    if (!market) continue;

    for (const outcome of market.outcomes ?? []) {
      const current = prices.get(outcome.name);
      if (!current || Number(outcome.price) > current.price) {
        prices.set(outcome.name, {
          price: Number(outcome.price),
          bookmaker: bookmaker.title
        });
      }
    }
  }

  return prices;
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "mission-1000-tennis/1.3" }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  return {
    data: await response.json(),
    remaining: response.headers.get("x-requests-remaining"),
    used: response.headers.get("x-requests-used")
  };
}

const sportsUrl = new URL(`${API_BASE}/sports`);
sportsUrl.searchParams.set("apiKey", API_KEY);
sportsUrl.searchParams.set("all", "false");

const sportsResponse = await getJson(sportsUrl);
const sports = sportsResponse.data.filter(isWantedTennisSport);

console.log(`Gefundene Tennis-Wettbewerbe: ${sports.length}`);
for (const sport of sports) {
  console.log(`- ${sport.key}: ${sport.title}`);
}

const allMatches = [];
let quotaRemaining = sportsResponse.remaining;
let quotaUsed = sportsResponse.used;

for (const sport of sports) {
  const oddsUrl = new URL(`${API_BASE}/sports/${sport.key}/odds`);
  oddsUrl.searchParams.set("apiKey", API_KEY);
  oddsUrl.searchParams.set("regions", "eu");
  oddsUrl.searchParams.set("markets", "h2h");
  oddsUrl.searchParams.set("oddsFormat", "decimal");
  oddsUrl.searchParams.set("dateFormat", "iso");

  const oddsResponse = await getJson(oddsUrl);
  quotaRemaining = oddsResponse.remaining ?? quotaRemaining;
  quotaUsed = oddsResponse.used ?? quotaUsed;

  for (const event of oddsResponse.data) {
    const local = localParts(event.commence_time);
    const prices = bestPrices(event);
    const player1Price = prices.get(event.home_team);
    const player2Price = prices.get(event.away_team);

    allMatches.push({
      id: event.id,
      tour: tourFromSport(sport),
      event: tournamentName(sport),
      round: "",
      startIso: event.commence_time,
      date: local.date,
      start: local.time,
      status: new Date(event.commence_time) <= new Date() ? "live-or-started" : "upcoming",
      player1: event.home_team,
      player2: event.away_team,
      odds1: player1Price?.price ?? null,
      odds2: player2Price?.price ?? null,
      bookmaker1: player1Price?.bookmaker ?? null,
      bookmaker2: player2Price?.bookmaker ?? null,

      // Noch keine erfundene Prognose. Diese Felder werden später durch das Modell ergänzt.
      pick: null,
      probability: null,
      fairOdds: null,
      marketOdds: null,
      value: null,
      confidence: null,
      topPick: false,
      reasons: [
        "Live-/Tagesdaten und beste verfügbare EU-Matchwinnerquote wurden automatisch geladen.",
        "Eine belastbare Prognose wird erst angezeigt, sobald Form-, Belag- und Leistungsdaten angebunden sind."
      ]
    });
  }
}

const uniqueMatches = [...new Map(allMatches.map(match => [match.id, match])).values()]
  .sort((a, b) => new Date(a.startIso) - new Date(b.startIso));

const output = {
  generatedAt: new Date().toISOString(),
  source: "The Odds API",
  timezone: TIME_ZONE,
  quota: {
    used: quotaUsed,
    remaining: quotaRemaining
  },
  matches: uniqueMatches
};

const outputPath = path.resolve("data/matches.json");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(`${uniqueMatches.length} Matches nach ${outputPath} geschrieben.`);
console.log(`API-Credits: used=${quotaUsed ?? "?"}, remaining=${quotaRemaining ?? "?"}`);
