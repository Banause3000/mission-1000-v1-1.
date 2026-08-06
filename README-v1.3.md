# Mission 1000 Tennis v1.3

## Neu
- GitHub Action lädt echte, kommende und laufende Tennis-Matches.
- The Odds API liefert Matchwinnerquoten aus der EU-Region.
- Challenger, ITF, Doppel und Outrights werden gefiltert.
- Keine erfundenen Prognosen: Modellfelder bleiben zunächst offen.
- Automatische Aktualisierung täglich sowie manuell über GitHub Actions.

## Einrichtung
Repository Secret:
`ODDS_API_KEY`

Workflow:
`.github/workflows/update-matches.yml`

Manueller Start:
Actions → Tennisdaten aktualisieren → Run workflow
