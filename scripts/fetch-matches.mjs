import fs from "fs";

const API_KEY = process.env.ODDS_API_KEY;

const SPORT = "tennis_atp";
const REGIONS = "eu";
const MARKETS = "h2h";

async function fetchMatches() {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/?regions=${REGIONS}&markets=${MARKETS}&apiKey=${API_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();

  fs.writeFileSync(
    "./data/matches.json",
    JSON.stringify(data, null, 2)
  );

  console.log(`Gespeichert: ${data.length} Spiele`);
}

fetchMatches();
