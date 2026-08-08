import csv
import io
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

OUT_RANKINGS = ROOT / "data" / "sources" / "rankings.json"
OUT_PLAYERS = ROOT / "data" / "sources" / "players.json"

BASE_URL = "https://raw.githubusercontent.com/Kadantte/tennis_atp/master"

RANKINGS_URL = f"{BASE_URL}/atp_rankings_20s.csv"
PLAYERS_URL = f"{BASE_URL}/atp_players.csv"


def download(url):
    print(f"Lade: {url}")

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mission1000-DataEngine/1.0"
        }
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8-sig")


def load_players(csv_text):
    players = {}

    reader = csv.DictReader(io.StringIO(csv_text))

    for row in reader:
        player_id = str(
            row.get("player_id")
            or row.get("player")
            or ""
        ).strip()

        if not player_id:
            continue

        first_name = str(
            row.get("name_first")
            or row.get("first_name")
            or ""
        ).strip()

        last_name = str(
            row.get("name_last")
            or row.get("last_name")
            or ""
        ).strip()

        name = f"{first_name} {last_name}".strip()

        if not name:
            continue

        country = str(
            row.get("ioc")
            or row.get("country_code")
            or ""
        ).strip()

        hand = str(
            row.get("hand")
            or ""
        ).strip()

        height_raw = str(
            row.get("height")
            or ""
        ).strip()

        try:
            height = int(float(height_raw)) if height_raw else None
        except ValueError:
            height = None

        dob = str(
            row.get("dob")
            or row.get("birth_date")
            or ""
        ).strip()

        players[player_id] = {
            "playerId": player_id,
            "name": name,
            "tour": "ATP",
            "country": country,
            "hand": hand or None,
            "height": height,
            "dob": dob or None
        }

    return players


def load_latest_rankings(csv_text, players):
    reader = csv.DictReader(io.StringIO(csv_text))

    rows = []
    latest_date = None

    for row in reader:
        ranking_date = str(
            row.get("ranking_date")
            or row.get("date")
            or ""
        ).strip()

        if not ranking_date:
            continue

        if latest_date is None or ranking_date > latest_date:
            latest_date = ranking_date

        rows.append(row)

    if latest_date is None:
        raise RuntimeError("Keine Ranking-Daten gefunden.")

    print(f"Neuester Ranking-Stand: {latest_date}")

    rankings = []

    for row in rows:
        ranking_date = str(
            row.get("ranking_date")
            or row.get("date")
            or ""
        ).strip()

        if ranking_date != latest_date:
            continue

        player_id = str(
            row.get("player")
            or row.get("player_id")
            or ""
        ).strip()

        try:
            rank = int(
                row.get("rank")
                or row.get("ranking")
            )
        except (ValueError, TypeError):
            continue

        try:
            points = int(
                row.get("points")
                or row.get("ranking_points")
                or 0
            )
        except (ValueError, TypeError):
            points = 0

        player = players.get(player_id)

        if not player:
            continue

        rankings.append({
            "tour": "ATP",
            "playerId": player_id,
            "name": player["name"],
            "country": player["country"],
            "rank": rank,
            "points": points
        })

    rankings.sort(key=lambda x: x["rank"])

    return latest_date, rankings


def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)

    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2
        ),
        encoding="utf-8"
    )


def main():
    print("MISSION 1000")
    print("ATP Ranking Collector")
    print("---------------------")

    players_csv = download(PLAYERS_URL)
    rankings_csv = download(RANKINGS_URL)

    players = load_players(players_csv)

    print(f"{len(players)} ATP-Spieler gefunden.")

    ranking_date, rankings = load_latest_rankings(
        rankings_csv,
        players
    )

    now = datetime.now(timezone.utc).isoformat()

    ranking_payload = {
        "generatedAt": now,
        "rankingDate": ranking_date,
        "source": "Jeff Sackmann tennis_atp dataset",
        "players": rankings
    }

    player_payload = {
        "generatedAt": now,
        "source": "Jeff Sackmann tennis_atp dataset",
        "players": list(players.values())
    }

    save_json(
        OUT_RANKINGS,
        ranking_payload
    )

    save_json(
        OUT_PLAYERS,
        player_payload
    )

    print()
    print("FERTIG")
    print(f"Rankings gespeichert: {len(rankings)}")
    print(f"Spieler gespeichert: {len(players)}")
    print(f"Ranking-Datum: {ranking_date}")


if __name__ == "__main__":
    main()
