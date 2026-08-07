MISSION 1000
Version 0.8.1 - Kostenloser Formquellen-Test

WICHTIG:
Dieses Paket soll deine funktionierende App nicht ersetzen.
Die App-Dateien sind nur als Sicherung enthalten.

NEU HOCHLADEN:
1. scripts/build_form_from_csv.py
2. .github/workflows/test-form-source.yml

SO GEHT ES AUF DEM IPHONE:
1. GitHub -> Add file -> Create new file
2. Dateiname: scripts/build_form_from_csv.py
3. Inhalt der Datei aus dem ZIP einfuegen und committen.
4. Zweite Datei erstellen:
   .github/workflows/test-form-source.yml
5. Wieder committen.
6. Danach GitHub -> Actions -> Test kostenlose Formquelle -> Run workflow.
7. Ergebnis-Screenshot schicken.

WAS PASSIERT:
- Workflow oeffnet die kostenlose TennisData.App-Downloadseite.
- Er sucht die offiziellen 2026 ATP- und WTA-CSV-Links.
- Nur wenn beide sichtbar sind, werden sie geladen.
- Challenger werden herausgefiltert.
- Fuer jeden Spieler werden die letzten bis zu 5 beendeten Matches berechnet.
- data/form.json wird nur bei erfolgreichem Lauf ersetzt.

SICHER:
Wenn Bot-Schutz oder ein unbekanntes CSV-Schema stoert, bricht der Test ab.
Deine bestehende form.json bleibt dann unangetastet.
