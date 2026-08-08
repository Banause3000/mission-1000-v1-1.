#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import json
import os
import re
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "sources"
INTEL = ROOT / "data" / "intelligence"
EXTERNAL = ROOT / ".external" / "tennis-source"

USER_AGENT = "Mission1000-DataEngine/3.2"

HISTORY_YEARS = list(range(2019, 2027))

ATP_URL_TEMPLATES = [
    "https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_matches_{year}.csv",
    "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_{year}.csv",
]

WTA_URL_TEMPLATES = [
    "https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_matches_{year}.csv",
]


SURFACE_KEYS = {
    "HARD": "hard",
    "CLAY": "clay",
    "GRASS": "grass",
    "CARPET": "indoor",
    "INDOOR": "indoor",
}

def now_iso():
    return datetime.now(timezone.utc).isoformat()

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

def as_float(value):
    try:
        if value is None or str(value).strip() == "":
            return None
        return float(value)
    except Exception:
        return None

def pct(num, den):
    if den in (None, 0):
        return None
    return round(num / den * 100, 1)

def normalize_date(value):
    s = re.sub(r"[^0-9]", "", str(value or ""))
    if len(s) >= 8:
        return s[:8]
    return s

def download_first(urls):
    errors = []
    for url in urls:
        try:
            print(f"Versuche: {url}")
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as response:
                text = response.read().decode("utf-8-sig")
            if "winner_name" not in text or "loser_name" not in text:
                raise RuntimeError("CSV hat nicht die erwarteten Match-Spalten.")
            print(f"OK: {url}")
            return text, url
        except Exception as exc:
            errors.append(f"{url}: {exc}")
            print(f"FEHLER: {exc}")
    raise RuntimeError("Keine ATP-Quelle erreichbar:\n" + "\n".join(errors))


def download_year(tour, year):
    templates = ATP_URL_TEMPLATES if tour == "ATP" else WTA_URL_TEMPLATES
    urls = [template.format(year=year) for template in templates]
    try:
        text, url = download_first(urls)
        return parse_csv_text(text, tour, url), url
    except Exception as exc:
        print(f"{tour} {year} optional nicht geladen: {exc}")
        return [], None

def is_real_match(row):
    score = str(row.get("score") or row.get("Score") or "").strip().upper()
    # Walkovers are not useful for form/H2H strength and can distort records.
    if score in {"W/O", "WO", "WALKOVER"}:
        return False
    return True

def normalize_event_name(value):
    text = str(value or "").casefold()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    aliases = {
        "national bank open presented by rogers": "canadian open",
        "rogers cup": "canadian open",
        "canada masters": "canadian open",
        "montreal": "canadian open",
        "toronto": "canadian open",
    }
    for old, new in aliases.items():
        text = text.replace(old, new)
    return re.sub(r"\s+", " ", text).strip()

def build_tournament_surfaces(rows):
    votes = defaultdict(lambda: defaultdict(int))
    labels = {}

    for row in rows:
        event = row["_event"]
        raw_surface = str(row["_surface"] or "").upper().strip()
        surface = SURFACE_KEYS.get(raw_surface)
        if not event or not surface:
            continue

        key = (row["_tour"], normalize_event_name(event))
        votes[key][surface] += 1
        labels[key] = event

    events = []
    for (tour, normalized), surface_votes in votes.items():
        if not surface_votes:
            continue

        surface = max(surface_votes.items(), key=lambda item: item[1])[0]
        events.append({
            "tour": tour,
            "event": labels.get((tour, normalized), normalized),
            "normalizedEvent": normalized,
            "surface": surface,
            "samples": sum(surface_votes.values())
        })

    return events

def row_tour(row, path_hint=""):
    direct = str(row.get("tour") or row.get("Tour") or row.get("circuit") or "").upper().strip()
    if direct in {"ATP", "WTA"}:
        return direct

    hint = path_hint.lower()
    if "wta" in hint or "women" in hint or "female" in hint:
        return "WTA"
    if "atp" in hint or "men" in hint or "male" in hint:
        return "ATP"

    gender = str(row.get("gender") or row.get("sex") or "").lower()
    if gender in {"f", "female", "women", "w"}:
        return "WTA"
    if gender in {"m", "male", "men"}:
        return "ATP"

    return ""

def standardize_row(row, tour, source_name):
    winner = (row.get("winner_name") or row.get("Winner") or row.get("winner") or "").strip()
    loser = (row.get("loser_name") or row.get("Loser") or row.get("loser") or "").strip()
    if not winner or not loser:
        return None

    date = (
        row.get("tourney_date")
        or row.get("date")
        or row.get("Date")
        or row.get("match_date")
        or ""
    )

    surface = (
        row.get("surface")
        or row.get("Surface")
        or ""
    )

    event = (
        row.get("tourney_name")
        or row.get("tournament")
        or row.get("Tournament")
        or row.get("event")
        or ""
    )

    out = dict(row)
    out["_tour"] = tour
    out["_date"] = normalize_date(date)
    out["_winner"] = winner
    out["_loser"] = loser
    out["_surface"] = str(surface or "").strip()
    out["_event"] = str(event or "").strip()
    out["_source"] = source_name
    return out

def parse_csv_text(text, tour, source_name):
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for raw in reader:
        item = standardize_row(raw, tour, source_name)
        if item:
            rows.append(item)
    return rows

def scan_extension_rows():
    rows = []
    if not EXTERNAL.exists():
        print("Hinweis: externe WTA/ATP-Erweiterungsquelle fehlt.")
        return rows

    files = sorted(EXTERNAL.rglob("*.csv"))
    print(f"Externe CSV-Dateien gefunden: {len(files)}")

    for path in files:
        # Nur echte Match-Dateien einlesen.
        try:
            with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as fh:
                reader = csv.DictReader(fh)
                if not reader.fieldnames:
                    continue

                fields = {str(x).strip() for x in reader.fieldnames}
                has_match_names = (
                    {"winner_name", "loser_name"} <= fields
                    or {"Winner", "Loser"} <= fields
                )
                if not has_match_names:
                    continue

                count_before = len(rows)
                for raw in reader:
                    tour = row_tour(raw, str(path))
                    if tour not in {"ATP", "WTA"}:
                        continue
                    item = standardize_row(raw, tour, f"buildoak:{path.name}")
                    if item:
                        rows.append(item)

                if len(rows) > count_before:
                    print(f"  + {path.relative_to(EXTERNAL)}: {len(rows)-count_before}")
        except Exception as exc:
            print(f"  Ignoriere {path}: {exc}")

    return rows

def dedupe_rows(rows):
    seen = set()
    out = []
    for row in rows:
        key = (
            row["_tour"],
            row["_date"],
            row["_event"].casefold(),
            row["_winner"].casefold(),
            row["_loser"].casefold(),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    out.sort(key=lambda r: r["_date"])
    return out


def rank_from_row(row, side):
    candidates = [
        row.get(f"{side}_rank"),
        row.get(f"{side}Rank"),
        row.get(f"{side}_ranking"),
        row.get(f"{side}Ranking"),
    ]

    for value in candidates:
        rank = as_int(value)
        if rank is not None and rank > 0:
            return rank

    return None

def rank_points_from_row(row, side):
    candidates = [
        row.get(f"{side}_rank_points"),
        row.get(f"{side}RankPoints"),
        row.get(f"{side}_ranking_points"),
        row.get(f"{side}RankingPoints"),
    ]

    for value in candidates:
        points = as_int(value)
        if points is not None and points >= 0:
            return points

    return None

def build_ranking_fallback(rows):
    """
    Build a ranking snapshot from the newest observed official ranking value
    attached to each historical match row.

    This is primarily a WTA fallback when the separate ranking fetcher has no
    women's ranking source. It never invents a ranking and only uses a rank
    explicitly present in the source match data.
    """
    latest = {}

    for row in rows:
        tour = row["_tour"]
        date = row["_date"]

        for side, name in [
            ("winner", row["_winner"]),
            ("loser", row["_loser"]),
        ]:
            rank = rank_from_row(row, side)
            if not name or rank is None:
                continue

            key = (tour, name.casefold())
            points = rank_points_from_row(row, side)

            candidate = {
                "name": name,
                "tour": tour,
                "rank": rank,
                "points": points,
                "rankingDate": date,
                "rankingSource": "latest observed match ranking",
            }

            current = latest.get(key)

            # Prefer the newest dated observation.
            # If the date is identical, prefer the row that also contains points.
            if (
                current is None
                or date > str(current.get("rankingDate") or "")
                or (
                    date == str(current.get("rankingDate") or "")
                    and current.get("points") is None
                    and points is not None
                )
            ):
                latest[key] = candidate

    players = list(latest.values())
    players.sort(key=lambda p: (
        str(p.get("tour") or ""),
        int(p.get("rank") or 999999),
        str(p.get("name") or "")
    ))
    return players

def build_players(rows):
    players = {}

    for row in rows:
        tour = row["_tour"]

        for prefix, name in [("winner", row["_winner"]), ("loser", row["_loser"])]:
            ioc = (
                row.get(f"{prefix}_ioc")
                or row.get(f"{prefix}_country")
                or row.get(f"{prefix}_country_code")
                or ""
            )
            hand = row.get(f"{prefix}_hand") or ""
            height = as_int(row.get(f"{prefix}_ht") or row.get(f"{prefix}_height"))
            age = as_float(row.get(f"{prefix}_age"))

            key = (tour, name.casefold())
            current = players.get(key, {
                "name": name,
                "tour": tour,
                "country": "",
                "hand": None,
                "height": None,
                "age": None,
            })

            if ioc:
                current["country"] = str(ioc).strip().upper()
            if hand:
                current["hand"] = str(hand).strip()
            if height:
                current["height"] = height
            if age:
                current["age"] = round(age, 2)

            players[key] = current

    return list(players.values())

def build_form(rows):
    history = defaultdict(list)

    for row in rows:
        if not is_real_match(row):
            continue

        base = {
            "date": row["_date"],
            "surface": row["_surface"],
            "event": row["_event"],
            "round": row.get("round") or row.get("Round") or "",
            "score": row.get("score") or row.get("Score") or "",
        }

        history[(row["_tour"], row["_winner"])].append({
            **base,
            "opponent": row["_loser"],
            "result": "W",
        })

        history[(row["_tour"], row["_loser"])].append({
            **base,
            "opponent": row["_winner"],
            "result": "L",
        })

    players = []
    for (tour, name), matches in history.items():
        latest = sorted(matches, key=lambda x: x["date"], reverse=True)[:10]
        wins = sum(1 for m in latest if m["result"] == "W")
        players.append({
            "name": name,
            "tour": tour,
            "lastMatches": latest,
            "wins": wins,
            "total": len(latest),
            "formPct": round(wins / len(latest) * 100) if latest else None,
        })

    return players

def build_h2h(rows):
    pairs = {}

    for row in rows:
        if not is_real_match(row):
            continue

        tour = row["_tour"]
        winner = row["_winner"]
        loser = row["_loser"]
        ordered = sorted([winner, loser], key=lambda x: x.casefold())
        key = (tour, ordered[0].casefold(), ordered[1].casefold())

        rec = pairs.setdefault(key, {
            "tour": tour,
            "player1": ordered[0],
            "player2": ordered[1],
            "wins1": 0,
            "wins2": 0,
            "meetings": 0,
            "lastMeeting": None,
            "recentMeetings": [],
        })

        if winner.casefold() == rec["player1"].casefold():
            rec["wins1"] += 1
        else:
            rec["wins2"] += 1

        rec["meetings"] += 1

        meeting = {
            "date": row["_date"],
            "event": row["_event"],
            "surface": row["_surface"],
            "winner": winner,
            "loser": loser,
            "score": row.get("score") or row.get("Score") or "",
        }

        rec["recentMeetings"].append(meeting)
        rec["recentMeetings"] = sorted(
            rec["recentMeetings"],
            key=lambda item: item.get("date") or "",
            reverse=True
        )[:5]

        rec["lastMeeting"] = rec["recentMeetings"][0]

    return list(pairs.values())

def build_surface(rows):
    agg_all = defaultdict(lambda: defaultdict(lambda: {"wins": 0, "losses": 0}))
    agg_recent = defaultdict(lambda: defaultdict(lambda: {"wins": 0, "losses": 0}))

    valid_dates = [r["_date"] for r in rows if len(r["_date"]) == 8 and r["_date"].isdigit()]
    newest = max(valid_dates) if valid_dates else ""
    cutoff = ""
    if newest:
        year = int(newest[:4]) - 2
        cutoff = f"{year:04d}{newest[4:]}"

    for row in rows:
        if not is_real_match(row):
            continue

        raw = str(row["_surface"] or "").upper().strip()
        key = SURFACE_KEYS.get(raw)
        if not key:
            continue

        player_keys = [
            ((row["_tour"], row["_winner"]), "wins"),
            ((row["_tour"], row["_loser"]), "losses"),
        ]

        for player_key, result_key in player_keys:
            agg_all[player_key][key][result_key] += 1
            if not cutoff or row["_date"] >= cutoff:
                agg_recent[player_key][key][result_key] += 1

    players = []
    all_player_keys = set(agg_all.keys()) | set(agg_recent.keys())

    for tour, name in all_player_keys:
        payload = {}
        surface_names = set(agg_all[(tour, name)].keys()) | set(agg_recent[(tour, name)].keys())

        for surface in surface_names:
            career = agg_all[(tour, name)][surface]
            recent = agg_recent[(tour, name)][surface]

            career_total = career["wins"] + career["losses"]
            recent_total = recent["wins"] + recent["losses"]

            # Prefer the recent sample if we have enough matches.
            chosen = recent if recent_total >= 5 else career
            total = chosen["wins"] + chosen["losses"]

            payload[surface] = {
                "wins": chosen["wins"],
                "losses": chosen["losses"],
                "total": total,
                "winPct": round(chosen["wins"] / total * 100, 1) if total else None,
                "period": "24m" if recent_total >= 5 else "career",
                "recent": {
                    "wins": recent["wins"],
                    "losses": recent["losses"],
                    "total": recent_total,
                    "winPct": round(recent["wins"] / recent_total * 100, 1) if recent_total else None,
                },
                "career": {
                    "wins": career["wins"],
                    "losses": career["losses"],
                    "total": career_total,
                    "winPct": round(career["wins"] / career_total * 100, 1) if career_total else None,
                }
            }

        players.append({"name": name, "tour": tour, "surfaces": payload})

    return players


def stat_value(row, side, keys):
    prefixes = [f"{side}_", f"{side}"]
    for key in keys:
        for prefix in prefixes:
            value = row.get(prefix + key)
            if value not in (None, ""):
                n = as_int(value)
                if n is not None:
                    return n
    return None

def build_stats(rows):
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

    def add_player(tour, name, own_side, opp_side, row):
        own_svpt = stat_value(row, own_side, ["svpt", "SvPts"])
        opp_svpt = stat_value(row, opp_side, ["svpt", "SvPts"])
        if own_svpt is None or opp_svpt is None:
            return

        own_1stin = stat_value(row, own_side, ["1stIn", "1st"])
        own_1stw = stat_value(row, own_side, ["1stWon", "1stWon"])
        own_svgms = stat_value(row, own_side, ["SvGms", "service_games"])
        own_bps = stat_value(row, own_side, ["bpSaved", "BPSaved"])
        own_bpf = stat_value(row, own_side, ["bpFaced", "BPFaced"])

        opp_1stin = stat_value(row, opp_side, ["1stIn", "1st"])
        opp_1stw = stat_value(row, opp_side, ["1stWon", "1stWon"])
        opp_2ndw = stat_value(row, opp_side, ["2ndWon", "2ndWon"])
        opp_svgms = stat_value(row, opp_side, ["SvGms", "service_games"])
        opp_bps = stat_value(row, opp_side, ["bpSaved", "BPSaved"])
        opp_bpf = stat_value(row, opp_side, ["bpFaced", "BPFaced"])

        t = totals[(tour, name)]
        t["matchesWithStats"] += 1

        if own_svgms is not None:
            t["service_games"] += own_svgms
        if own_bpf is not None and own_bps is not None:
            t["breaks_suffered"] += max(0, own_bpf - own_bps)

        if opp_svgms is not None:
            t["return_games"] += opp_svgms
        if opp_bpf is not None and opp_bps is not None:
            t["breaks_made"] += max(0, opp_bpf - opp_bps)

        if own_1stin is not None and own_1stw is not None:
            t["first_serve_points"] += own_1stin
            t["first_serve_won"] += own_1stw

        if all(x is not None for x in [opp_svpt, opp_1stin, opp_1stw, opp_2ndw]):
            opp_points_won_on_serve = opp_1stw + opp_2ndw
            t["return_points_total"] += opp_svpt
            t["return_points_won"] += max(0, opp_svpt - opp_points_won_on_serve)

    for row in rows:
        add_player(row["_tour"], row["_winner"], "w", "l", row)
        add_player(row["_tour"], row["_loser"], "l", "w", row)

    players = []
    for (tour, name), t in totals.items():
        if t["matchesWithStats"] <= 0:
            continue

        hold = None
        if t["service_games"] > 0:
            hold = round((t["service_games"] - t["breaks_suffered"]) / t["service_games"] * 100, 1)

        brk = None
        if t["return_games"] > 0:
            brk = round(t["breaks_made"] / t["return_games"] * 100, 1)

        players.append({
            "name": name,
            "tour": tour,
            "matchesWithStats": t["matchesWithStats"],
            "holdPct": hold,
            "breakPct": brk,
            "firstServeWonPct": pct(t["first_serve_won"], t["first_serve_points"]),
            "returnPointsWonPct": pct(t["return_points_won"], t["return_points_total"]),
        })

    return players

def main():
    print("=" * 68)
    print("MISSION 1000 DATA ENGINE v3.2")
    print("=" * 68)

    rows = []
    sources = []

    # Multi-year Tour history. This greatly improves H2H and surface samples.
    for year in HISTORY_YEARS:
        year_rows, url = download_year("ATP", year)
        rows.extend(year_rows)
        if url:
            sources.append(url)

        year_rows, url = download_year("WTA", year)
        rows.extend(year_rows)
        if url:
            sources.append(url)

    # Current WTA/ATP extension dataset cloned by the workflow.
    ext_rows = scan_extension_rows()
    rows.extend(ext_rows)
    if ext_rows:
        sources.append("buildoak/tennis-xgboost-autoresearch:data/extension")

    rows = dedupe_rows(rows)

    atp_rows = [r for r in rows if r["_tour"] == "ATP"]
    wta_rows = [r for r in rows if r["_tour"] == "WTA"]

    print(f"ATP Matchzeilen: {len(atp_rows)}")
    print(f"WTA Matchzeilen: {len(wta_rows)}")
    print(f"Gesamt Matchzeilen: {len(rows)}")

    if not rows:
        raise RuntimeError("Keine Matchhistorie geladen. Data Engine bricht absichtlich ab.")

    ranking_fallback = build_ranking_fallback(rows)
    players = build_players(rows)
    form = build_form(rows)
    h2h = build_h2h(rows)
    surface = build_surface(rows)
    stats = build_stats(rows)
    tournament_surfaces = build_tournament_surfaces(rows)

    if not form:
        raise RuntimeError("Form Engine erzeugte 0 Spieler. Kein stilles Leerschreiben erlaubt.")

    now = now_iso()

    save_json(SOURCE / "rankings_fallback.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v3.2 - latest observed match rankings",
        "players": ranking_fallback,
    })

    save_json(SOURCE / "players.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v3.1",
        "players": players,
    })

    save_json(SOURCE / "form.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v3.1",
        "players": form,
    })

    save_json(SOURCE / "h2h.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v3.1",
        "matches": h2h,
    })

    save_json(SOURCE / "surface.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v3.1",
        "players": surface,
    })

    save_json(SOURCE / "stats.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v3.1",
        "players": stats,
    })

    save_json(SOURCE / "tournament_surfaces.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v3.1",
        "events": tournament_surfaces,
    })

    diagnostics = {
        "generatedAt": now,
        "sources": sources,
        "rows": {
            "ATP": len(atp_rows),
            "WTA": len(wta_rows),
            "total": len(rows),
        },
        "outputs": {
            "rankingFallback": len(ranking_fallback),
            "rankingFallbackATP": sum(1 for p in ranking_fallback if p.get("tour") == "ATP"),
            "rankingFallbackWTA": sum(1 for p in ranking_fallback if p.get("tour") == "WTA"),
            "players": len(players),
            "form": len(form),
            "h2h": len(h2h),
            "surface": len(surface),
            "stats": len(stats),
            "tournamentSurfaces": len(tournament_surfaces),
        },
        "status": "OK",
    }

    save_json(INTEL / "diagnostics.json", diagnostics)

    print(json.dumps(diagnostics, ensure_ascii=False, indent=2))
    print("DATA ENGINE v3.2: OK")

if __name__ == "__main__":
    main()
