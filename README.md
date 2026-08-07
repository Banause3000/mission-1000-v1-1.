# Mission 1000 Tennis v2

## Vor dem Löschen
ZIP herunterladen, in der iPhone-Dateien-App entpacken und prüfen.

## Repository Secret
`ODDS_API_KEY`

## Workflow
`.github/workflows/update-matches.yml`

## Erster Start
Actions → Tennisdaten aktualisieren → Run workflow → main.

## iPhone-Backup
Falls der versteckte Ordner `.github` beim Upload nicht übernommen wird:
Actions → New workflow → Set up a workflow yourself.
Als Dateiname nur `update-matches.yml` verwenden und den Inhalt aus
`WORKFLOW-BACKUP.txt` einfügen. GitHub legt die Datei dann automatisch im
richtigen Workflow-Ordner ab.

Version 2 zeigt echte Matches und Matchwinnerquoten. Prognosen werden nicht
erfunden, sondern später mit zusätzlichen Leistungsdaten ergänzt.
