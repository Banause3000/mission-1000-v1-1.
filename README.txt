MISSION 1000
Version 0.8.3 - ESPN Formquellen-Test

WARUM DIESE VERSION?
Die bisher getesteten kostenlosen CSV-Quellen waren entweder blockiert (403),
nicht erreichbar (404) oder fuer August 2026 zu alt.

Diese Version testet den oeffentlich erreichbaren ESPN-Tennis-Scoreboard-Endpunkt.
Dafuer ist kein API-Key vorgesehen.

NEU HOCHLADEN:
1. scripts/build_form_espn.py
2. .github/workflows/test-espn-form.yml

DEINE APP BLEIBT UNVERAENDERT.
data/form.json wird nur ersetzt, wenn der Parser mindestens 10 Spieler
aus abgeschlossenen ATP/WTA-Matches erkennt.

DANACH:
GitHub -> Actions -> ESPN Formquelle testen -> Run workflow

Schick danach einen Screenshot.
Wenn der Lauf gruen ist, bauen wir aus diesem Test den taeglichen Form-Workflow.

Hinweis:
Der ESPN-Endpunkt ist ein oeffentlicher Site-API-Endpunkt, aber keine vertraglich
garantierte Entwickler-API. Deshalb testen wir ihn erst sicher, bevor wir ihn
dauerhaft in Mission 1000 einbauen.
