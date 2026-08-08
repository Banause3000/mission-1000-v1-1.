#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import json
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "sources"

ATP_MATCHES_URL = "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_2026.csv"
WTA_MATCHES_URL = "https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_matches_2026.csv"

USER_AGENT = "Mission1000-DataEngine/2.4"

SURFACE_KEYS = {
    "HARD": "hard",
    "CLAY": "clay",
    "GRASS": "grass",
    "CARPET": "indoor",
}

def download(url: str) -> str:
    print(f"Lade {url}")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=90) as response:
        return response.read().decode("utf-8-sig")

def save_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)

def as_int(value):
    try:
        if value is None or str(value).strip() == "":
            return None
        return int(float(value))
    except Exception:
        return None

def pct(numerator, denominator):
    if denominator in (None, 0):
        return None
    return round(numerator / denominator * 100, 1)

def parse_rows(csv_text: str, tour: str):
    rows = []
    reader = csv.DictReader(io.StringIO(csv_text))
    for row in reader:
        winner = (row.get("winner_name") or "").strip()
        loser = (row.get("loser_name") or "").strip()
        if not winner or not loser:
            continue

        row["_tour"] = tour
        row["_date"] = str(row.get("tourney_date") or "")
        rows.append(row)

    rows.sort(key=lambda r: r["_date"])
    return rows

def build_form(all_rows):
    history = defaultdict(list)

    for row in all_rows:
        tour = row["_tour"]
        date = row["_date"]
        surface = (row.get("surface") or "").strip()

        winner = row["winner_name"].strip()
        loser = row["loser_name"].strip()

        history[(tour, winner)].append({
            "date": date,
            "opponent": loser,
            "result": "W",
            "surface": surface,
            "event": row.get("tourney_name") or "",
            "round": row.get("round") or "",
        })

        history[(tour, loser)].append({
            "date": date,
            "opponent": winner,
            "result": "L",
            "surface": surface,
            "event": row.get("tourney_name") or "",
            "round": row.get("round") or "",
        })

    players = []
    for (tour, name), matches in history.items():
        latest = sorted(matches, key=lambda x: x["date"], reverse=True)[:10]
        players.append({
            "name": name,
            "tour": tour,
            "lastMatches": latest,
        })

    return players

def build_h2h(all_rows):
    pairs = {}

    for row in all_rows:
        tour = row["_tour"]
        winner = row["winner_name"].strip()
        loser = row["loser_name"].strip()

        key_names = sorted([winner, loser], key=lambda x: x.casefold())
        key = (tour, key_names[0], key_names[1])

        if key not in pairs:
            pairs[key] = {
                "tour": tour,
                "player1": key_names[0],
                "player2": key_names[1],
                "wins1": 0,
                "wins2": 0,
                "lastMeeting": None,
            }

        rec = pairs[key]
        if winner == rec["player1"]:
            rec["wins1"] += 1
        else:
            rec["wins2"] += 1

        rec["lastMeeting"] = {
            "date": row["_date"],
            "event": row.get("tourney_name") or "",
            "surface": row.get("surface") or "",
            "winner": winner,
            "loser": loser,
            "score": row.get("score") or "",
        }

    return list(pairs.values())

def build_surface(all_rows):
    surface = defaultdict(lambda: defaultdict(lambda: {"wins": 0, "losses": 0}))

    for row in all_rows:
        tour = row["_tour"]
        raw_surface = (row.get("surface") or "").strip().upper()
        surface_key = SURFACE_KEYS.get(raw_surface)
        if not surface_key:
            continue

        winner = row["winner_name"].strip()
        loser = row["loser_name"].strip()

        surface[(tour, winner)][surface_key]["wins"] += 1
        surface[(tour, loser)][surface_key]["losses"] += 1

    players = []
    for (tour, name), records in surface.items():
        players.append({
            "name": name,
            "tour": tour,
            "surfaces": dict(records),
        })

    return players

def build_stats(all_rows):
    totals = defaultdict(lambda: {
        "service_games": 0,
        "breaks_suffered": 0,
        "return_games": 0,
        "breaks_made": 0,
        "first_serve_won": 0,
        "first_serve_points": 0,
        "return_points_won": 0,
        "return_points_total": 0,
        "matchesWithStats": 0,
    })

    def add_player(tour, name, own, opp):
        key = (tour, name)
        t = totals[key]

        own_svpt = as_int(own.get("svpt"))
        own_1st = as_int(own.get("1stIn"))
        own_1stw = as_int(own.get("1stWon"))
        own_svgms = as_int(own.get("SvGms"))
        own_bp_saved = as_int(own.get("bpSaved"))
        own_bp_faced = as_int(own.get("bpFaced"))

        opp_svpt = as_int(opp.get("svpt"))
        opp_1st = as_int(opp.get("1stIn"))
        opp_1stw = as_int(opp.get("1stWon"))
        opp_2ndw = as_int(opp.get("2ndWon"))
        opp_svgms = as_int(opp.get("SvGms"))
        opp_bp_saved = as_int(opp.get("bpSaved"))
        opp_bp_faced = as_int(opp.get("bpFaced"))

        if own_svpt is None or opp_svpt is None:
            return

        t["matchesWithStats"] += 1

        if own_svgms is not None:
            t["service_games"] += own_svgms
        if own_bp_faced is not None and own_bp_saved is not None:
            t["breaks_suffered"] += max(0, own_bp_faced - own_bp_saved)

        if opp_svgms is not None:
            t["return_games"] += opp_svgms
        if opp_bp_faced is not None and opp_bp_saved is not None:
            t["breaks_made"] += max(0, opp_bp_faced - opp_bp_saved)

        if own_1st is not None and own_1stw is not None:
            t["first_serve_points"] += own_1st
            t["first_serve_won"] += own_1stw

        # Approximate total opponent service points won by returner:
        # return points won = opponent service points - opponent points won on serve
        if all(x is not None for x in (opp_svpt, opp_1st, opp_1stw, opp_2ndw)):
            opp_serve_points_won = opp_1stw + opp_2ndw
            t["return_points_total"] += opp_svpt
            t["return_points_won"] += max(0, opp_svpt - opp_serve_points_won)

    for row in all_rows:
        tour = row["_tour"]
        winner = row["winner_name"].strip()
        loser = row["loser_name"].strip()

        w = {
            "svpt": row.get("w_svpt"),
            "1stIn": row.get("w_1stIn"),
            "1stWon": row.get("w_1stWon"),
            "2ndWon": row.get("w_2ndWon"),
            "SvGms": row.get("w_SvGms"),
            "bpSaved": row.get("w_bpSaved"),
            "bpFaced": row.get("w_bpFaced"),
        }
        l = {
            "svpt": row.get("l_svpt"),
            "1stIn": row.get("l_1stIn"),
            "1stWon": row.get("l_1stWon"),
            "2ndWon": row.get("l_2ndWon"),
            "SvGms": row.get("l_SvGms"),
            "bpSaved": row.get("l_bpSaved"),
            "bpFaced": row.get("l_bpFaced"),
        }

        add_player(tour, winner, w, l)
        add_player(tour, loser, l, w)

    players = []
    for (tour, name), t in totals.items():
        if t["matchesWithStats"] <= 0:
            continue

        hold_pct = None
        if t["service_games"] > 0:
            hold_pct = round((t["service_games"] - t["breaks_suffered"]) / t["service_games"] * 100, 1)

        break_pct = None
        if t["return_games"] > 0:
            break_pct = round(t["breaks_made"] / t["return_games"] * 100, 1)

        players.append({
            "name": name,
            "tour": tour,
            "matchesWithStats": t["matchesWithStats"],
            "holdPct": hold_pct,
            "breakPct": break_pct,
            "firstServeWonPct": pct(t["first_serve_won"], t["first_serve_points"]),
            "returnPointsWonPct": pct(t["return_points_won"], t["return_points_total"]),
        })

    return players

def main():
    print("=" * 56)
    print("MISSION 1000 - INTELLIGENCE COLLECTOR")
    print("=" * 56)

    atp = parse_rows(download(ATP_MATCHES_URL), "ATP")
    wta = parse_rows(download(WTA_MATCHES_URL), "WTA")
    all_rows = atp + wta

    now = datetime.now(timezone.utc).isoformat()

    form = build_form(all_rows)
    h2h = build_h2h(all_rows)
    surface = build_surface(all_rows)
    stats = build_stats(all_rows)

    save_json(SOURCE/"form.json", {
        "generatedAt": now,
        "source": "Jeff Sackmann 2026 ATP/WTA results",
        "players": form,
    })
    save_json(SOURCE/"h2h.json", {
        "generatedAt": now,
        "source": "Jeff Sackmann 2026 ATP/WTA results",
        "matches": h2h,
    })
    save_json(SOURCE/"surface.json", {
        "generatedAt": now,
        "source": "Jeff Sackmann 2026 ATP/WTA results",
        "players": surface,
    })
    save_json(SOURCE/"stats.json", {
        "generatedAt": now,
        "source": "Jeff Sackmann 2026 ATP/WTA match stats",
        "players": stats,
    })

    print(f"ATP matches: {len(atp)}")
    print(f"WTA matches: {len(wta)}")
    print(f"Form players: {len(form)}")
    print(f"H2H pairs: {len(h2h)}")
    print(f"Surface players: {len(surface)}")
    print(f"Stats players: {len(stats)}")
    print("INTELLIGENCE COLLECTOR: OK")

if __name__ == "__main__":
    main()
