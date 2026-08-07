#!/usr/bin/env python3
import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

OUT = Path("data/form.json")

def clean_name(value):
    return " ".join((value or "").strip().split())

def parse_match_file(path, tour):
    rows = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        required = {"tourney_date", "winner_name", "loser_name"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise RuntimeError(
                f"{path}: Spalten fehlen: {', '.join(sorted(missing))}"
            )

        for row in reader:
            winner = clean_name(row.get("winner_name"))
            loser = clean_name(row.get("loser_name"))

            if not winner or not loser:
                continue

            raw_date = str(row.get("tourney_date") or "").strip()
            date = ""
            if len(raw_date) == 8 and raw_date.isdigit():
                date = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}"

            rows.append({
                "tour": tour,
                "date": date,
                "winner": winner,
                "loser": loser,
                "surface": (row.get("surface") or "").strip() or None,
                "tournament": (row.get("tourney_name") or "").strip() or None,
                "round": (row.get("round") or "").strip() or None,
                "score": (row.get("score") or "").strip() or None
            })

    return rows

def build_form(matches):
    by_player = defaultdict(list)

    matches.sort(
        key=lambda m: (m["date"] or "0000-00-00"),
        reverse=True
    )

    for m in matches:
        common = {
            "date": m["date"],
            "surface": m["surface"],
            "tournament": m["tournament"],
            "round": m["round"],
            "score": m["score"]
        }

        by_player[(m["tour"], m["winner"])].append({
            "result": "W",
            "opponent": m["loser"],
            **common
        })

        by_player[(m["tour"], m["loser"])].append({
            "result": "L",
            "opponent": m["winner"],
            **common
        })

    players = []
    for (tour, name), matches in sorted(
        by_player.items(),
        key=lambda item: (item[0][0], item[0][1])
    ):
        players.append({
            "name": name,
            "tour": tour,
            "lastMatches": matches[:5]
        })

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Jeff Sackmann / Tennis Abstract",
        "license": "CC BY-NC-SA 4.0",
        "players": players
    }

def main():
    if len(sys.argv) != 3:
        print(
            "Usage: build_form_sackmann.py atp_matches_2026.csv wta_matches_2026.csv",
            file=sys.stderr
        )
        return 2

    atp_path = Path(sys.argv[1])
    wta_path = Path(sys.argv[2])

    matches = (
        parse_match_file(atp_path, "ATP")
        + parse_match_file(wta_path, "WTA")
    )

    payload = build_form(matches)

    if not payload["players"]:
        raise RuntimeError("Keine Formdaten erzeugt. Bestehende form.json bleibt erhalten.")

    OUT.parent.mkdir(parents=True, exist_ok=True)

    temp = OUT.with_suffix(".json.tmp")
    temp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    temp.replace(OUT)

    print(f"OK: {len(payload['players'])} Spieler in {OUT}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
