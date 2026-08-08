import csv
import io
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "sources" / "rankings.json"

ATP_URL = "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_rankings_current.csv"


def download_csv(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mission1000/1.0"}
    )

    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8")


def parse_atp_rankings(csv_text: str):
    players = []

    reader = csv.DictReader(io.StringIO(csv_text))

    for row in reader:
        try:
            rank = int(row["rank"])
        except (ValueError, TypeError, KeyError):
            continue

        player_id = str(row.get("player") or "").strip()

        if not player_id:
            continue

        players.append({
            "tour": "ATP",
            "playerId": player_id,
            "rank": rank
        })

    return players


def main():
    print("ATP Rankings werden geladen...")

    csv_text = download_csv(ATP_URL)
    players = parse_atp_rankings(csv_text)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Jeff Sackmann tennis_atp",
        "players": players
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)

    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print(f"{len(players)} ATP Rankings gespeichert.")
    print(f"Datei: {OUT}")


if __name__ == "__main__":
    main()
