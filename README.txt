MISSION 1000
Version 0.8.2 - Sackmann Form Engine

NEU HOCHLADEN:
1. scripts/build_form_sackmann.py
2. .github/workflows/update-form.yml

Danach:
GitHub -> Actions -> Formdaten aktualisieren -> Run workflow

Was der Workflow macht:
- lädt die offiziellen ATP- und WTA-Tour-Level-Dateien für 2026 direkt von GitHub Raw
- baut für jeden Spieler die letzten 5 Matches
- speichert W/L, Gegner, Datum, Oberfläche, Turnier, Runde und Score
- aktualisiert data/form.json
- läuft zusätzlich täglich automatisch

Wichtig:
Die ATP-Hauptdateien enthalten Tour-Level-Main-Draw-Matches; Challenger liegen in separaten Dateien.
Die WTA-Hauptdateien enthalten ebenfalls Tour-Level-Singles; ITF/Qualifying liegen separat.
Damit bleibt Mission 1000 weiterhin ohne Challenger.

Lizenz:
Jeff Sackmann / Tennis Abstract
CC BY-NC-SA 4.0
Attribution erforderlich, nicht-kommerzielle Nutzung, ShareAlike.

Kein Ampelsystem:
Die App verwendet weiterhin nur W/L bzw. neutrale Textdarstellung.
