#!/usr/bin/env python3
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

OUT = Path("data/form.json")

def clean_name(value):
    return " ".join(str(value or "").strip().split())

def parse_scoreboard(path: Path, tour: str):
    payload = json.loads(path.read_text(encoding="utf-8"))
    events = payload.get("events") or []
    matches = []

    for event in events:
        competitions = event.get("competitions") or []
        for comp in competitions:
            competitors = comp.get("competitors") or []
            if len(competitors) != 2:
                continue

            status = ((comp.get("status") or {}).get("type") or {})
            completed = bool(status.get("completed"))
            state = str(status.get("state") or "").lower()

            if not completed and state not in {"post", "final"}:
                continue

            p1 = competitors[0]
            p2 = competitors[1]

            name1 = clean_name(((p1.get("athlete") or {}).get("displayName")))
            name2 = clean_name(((p2.get("athlete") or {}).get("displayName")))
            if not name1 or not name2:
                continue

            winner1 = p1.get("winner")
            winner2 = p2.get("winner")

            if winner1 is True:
                winner, loser = name1, name2
            elif winner2 is True:
                winner, loser = name2, name1
            else:
                # Do not invent a winner if ESPN did not flag one.
                continue

            date_raw = comp.get("date") or event.get("date") or ""
            date = str(date_raw)[:10] if date_raw else ""

            league = ((event.get("league") or {}).get("name") or "")
            tournament = (
                ((comp.get("tournament") or {}).get("name"))
                or event.get("name")
                or league
                or None
            )

            matches.append({
                "tour": tour,
                "date": date,
                "winner": winner,
                "loser": loser,
                "tournament": tournament
            })

    return matches

def build_form(matches):
    # remove duplicates from overlapping daily/range files
    seen = set()
    unique = []
    for m in matches:
        key = (m["tour"], m["date"], m["winner"], m["loser"], m["tournament"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(m)

    unique.sort(key=lambda m: m["date"] or "0000-00-00", reverse=True)
    by_player = defaultdict(list)

    for m in unique:
        by_player[(m["tour"], m["winner"])].append({
            "result": "W",
            "opponent": m["loser"],
            "date": m["date"],
            "surface": None,
            "tournament": m["tournament"]
        })
        by_player[(m["tour"], m["loser"])].append({
            "result": "L",
            "opponent": m["winner"],
            "date": m["date"],
            "surface": None,
            "tournament": m["tournament"]
        })

    players = []
    for (tour, name), form in sorted(by_player.items(), key=lambda x: (x[0][0], x[0][1])):
        players.append({
            "name": name,
            "tour": tour,
            "lastMatches": form[:5]
        })

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "ESPN public tennis scoreboard",
        "players": players
    }

def main():
    if len(sys.argv) < 3:
        print("Usage: build_form_espn.py ATP_JSON... --wta WTA_JSON...", file=sys.stderr)
        return 2

    args = sys.argv[1:]
    if "--wta" not in args:
        print("Missing --wta separator", file=sys.stderr)
        return 2

    idx = args.index("--wta")
    atp_files = [Path(x) for x in args[:idx]]
    wta_files = [Path(x) for x in args[idx+1:]]

    if not atp_files or not wta_files:
        raise RuntimeError("ATP- oder WTA-Dateien fehlen.")

    matches = []
    for p in atp_files:
        matches += parse_scoreboard(p, "ATP")
    for p in wta_files:
        matches += parse_scoreboard(p, "WTA")

    payload = build_form(matches)

    # Safety gate: do not overwrite the working file with an empty/near-empty dataset.
    if len(payload["players"]) < 10:
        raise RuntimeError(
            f"Nur {len(payload['players'])} Spieler erkannt. "
            "Bestehende form.json bleibt unverändert."
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUT.with_suffix(".json.tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(OUT)

    print(f"OK: {len(payload['players'])} Spieler erzeugt.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
