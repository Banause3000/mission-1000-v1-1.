#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE = DATA / "sources"

SOURCE.mkdir(parents=True, exist_ok=True)

USER_AGENT = "Mission1000-RankingCollector/4.0"

ATP_PLAYERS_URLS = [
    "https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_players.csv",
    "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_players.csv",
    "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/refs/heads/master/atp_players.csv",
]

ATP_RANKING_URLS = [
    "https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_rankings_20s.csv",
    "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_rankings_20s.csv",
    "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/refs/heads/master/atp_rankings_20s.csv",
]

WTA_PLAYERS_URLS = [
    "https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_players.csv",
    "https://raw.githubusercontent.com/JeffSackmann/tennis_wta/refs/heads/master/wta_players.csv",
]

WTA_RANKING_URLS = [
    "https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_rankings_20s.csv",
    "https://raw.githubusercontent.com/JeffSackmann/tennis_wta/refs/heads/master/wta_rankings_20s.csv",
]

def download_first(urls):
    errors = []
    for url in urls:
        print("Lade:", url)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=35) as response:
                text = response.read().decode("utf-8-sig", errors="replace")
            if not text.strip():
                raise RuntimeError("leere Antwort")
            print("OK:", url)
            return text, url
        except Exception as exc:
            errors.append(f"{url}: {exc}")
            print("FEHLER:", exc)
    raise RuntimeError("Keine Quelle erreichbar:\n" + "\n".join(errors))

def clean(value):
    return str(value or "").strip()

def as_int(value):
    try:
        raw = clean(value)
        if raw == "":
            return None
        return int(float(raw))
    except Exception:
        return None

def normalize_name(first, last):
    return re.sub(r"\s+", " ", f"{clean(first)} {clean(last)}").strip()

def parse_rows(text):
    # Most Sackmann files have headers. If a mirror ever strips them,
    # the caller can still fall back to positional parsing.
    sample = text[:4096]
    try:
        has_header = csv.Sniffer().has_header(sample)
    except Exception:
        has_header = True

    if has_header:
        return list(csv.DictReader(io.StringIO(text)))

    return list(csv.reader(io.StringIO(text)))

def player_map(text, tour):
    rows = parse_rows(text)
    result = {}

    if rows and isinstance(rows[0], dict):
        for row in rows:
            pid = clean(
                row.get("player_id")
                or row.get("player")
                or row.get("id")
            )
            if not pid:
                continue

            first = row.get("name_first") or row.get("first_name") or row.get("first")
            last = row.get("name_last") or row.get("last_name") or row.get("last")
            name = normalize_name(first, last)

            result[pid] = {
                "playerId": pid,
                "name": name,
                "country": clean(row.get("ioc") or row.get("country_code") or row.get("country")),
                "tour": tour,
            }
        return result

    # Sackmann positional player schema:
    # player_id, name_first, name_last, hand, dob, ioc, ...
    for row in rows:
        if not isinstance(row, list) or len(row) < 3:
            continue
        pid = clean(row[0])
        if not pid or not pid.isdigit():
            continue
        result[pid] = {
            "playerId": pid,
            "name": normalize_name(row[1], row[2]),
            "country": clean(row[5]) if len(row) > 5 else "",
            "tour": tour,
        }

    return result

def ranking_rows(text):
    rows = parse_rows(text)

    if rows and isinstance(rows[0], dict):
        parsed = []
        for row in rows:
            parsed.append({
                "rankingDate": clean(row.get("ranking_date") or row.get("date")),
                "rank": as_int(row.get("rank") or row.get("ranking")),
                "playerId": clean(row.get("player") or row.get("player_id")),
                "points": as_int(row.get("points") or row.get("ranking_points")),
            })
        return parsed

    # Sackmann ranking schema:
    # ranking_date, rank, player, points, ...
    parsed = []
    for row in rows:
        if not isinstance(row, list) or len(row) < 3:
            continue
        date = clean(row[0])
        rank = as_int(row[1])
        pid = clean(row[2])
        points = as_int(row[3]) if len(row) > 3 else None
        if date and rank and pid:
            parsed.append({
                "rankingDate": date,
                "rank": rank,
                "playerId": pid,
                "points": points,
            })
    return parsed

def newest_snapshot(players_text, rankings_text, tour):
    players = player_map(players_text, tour)
    rankings = ranking_rows(rankings_text)

    valid = [
        row for row in rankings
        if row["rankingDate"] and row["rank"] and row["playerId"]
    ]

    if not valid:
        raise RuntimeError(f"{tour}: keine Rankingzeilen gefunden")

    newest = max(row["rankingDate"] for row in valid)

    # There can occasionally be duplicate rows for the same player/date.
    by_player = {}
    for row in valid:
        if row["rankingDate"] != newest:
            continue

        meta = players.get(row["playerId"])
        if not meta or not meta.get("name"):
            continue

        candidate = {
            "tour": tour,
            "playerId": row["playerId"],
            "name": meta["name"],
            "country": meta.get("country") or "",
            "rank": row["rank"],
            "points": row["points"],
            "rankingDate": newest,
        }

        old = by_player.get(row["playerId"])
        if old is None or candidate["rank"] < old["rank"]:
            by_player[row["playerId"]] = candidate

    snapshot = list(by_player.values())
    snapshot.sort(key=lambda p: (p["rank"], p["name"]))

    if not snapshot:
        raise RuntimeError(f"{tour}: neuester Ranking-Stand {newest} enthält keine zuordenbaren Spieler")

    return newest, snapshot

def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)

def collect_tour(tour):
    if tour == "ATP":
        player_urls = ATP_PLAYERS_URLS
        ranking_urls = ATP_RANKING_URLS
    else:
        player_urls = WTA_PLAYERS_URLS
        ranking_urls = WTA_RANKING_URLS

    players_text, player_source = download_first(player_urls)
    rankings_text, ranking_source = download_first(ranking_urls)
    ranking_date, players = newest_snapshot(players_text, rankings_text, tour)

    print(f"{tour}: {len(players)} Rankings @ {ranking_date}")

    return {
        "tour": tour,
        "rankingDate": ranking_date,
        "players": players,
        "sources": [player_source, ranking_source],
    }

def main():
    print("=" * 64)
    print("MISSION 1000 ATP + WTA RANKING COLLECTOR v4")
    print("=" * 64)

    collected = []
    errors = []

    for tour in ("ATP", "WTA"):
        try:
            collected.append(collect_tour(tour))
        except Exception as exc:
            errors.append(f"{tour}: {exc}")
            print(f"{tour} FEHLER:", exc)

    if not collected:
        raise SystemExit("Kein Ranking-Feed konnte geladen werden.\n" + "\n".join(errors))

    merged = []
    ranking_dates = {}
    sources = []

    for item in collected:
        merged.extend(item["players"])
        ranking_dates[item["tour"]] = item["rankingDate"]
        sources.extend(item["sources"])

    # If one tour fails, never erase an already-existing tour from rankings.json.
    existing_path = SOURCE / "rankings.json"
    if existing_path.exists():
        try:
            existing = json.loads(existing_path.read_text(encoding="utf-8"))
            existing_players = existing.get("players", []) if isinstance(existing, dict) else []
        except Exception:
            existing_players = []

        collected_tours = {item["tour"] for item in collected}
        preserved = [
            p for p in existing_players
            if str(p.get("tour") or "").upper() not in collected_tours
        ]
        merged.extend(preserved)

    now = datetime.now(timezone.utc).isoformat()

    save_json(SOURCE / "rankings.json", {
        "generatedAt": now,
        "source": "Mission 1000 Ranking Collector v4",
        "rankingDates": ranking_dates,
        "sources": sources,
        "players": merged,
    })

    print()
    print("FERTIG")
    print("Rankings gesamt:", len(merged))
    print("ATP:", sum(1 for p in merged if p.get("tour") == "ATP"))
    print("WTA:", sum(1 for p in merged if p.get("tour") == "WTA"))
    print("Ranking-Daten:", ranking_dates)

    if errors:
        print("WARNUNGEN:")
        for error in errors:
            print("-", error)

if __name__ == "__main__":
    main()
