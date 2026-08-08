#!/usr/bin/env python3
from __future__ import annotations
import csv, io, json, re, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE = DATA / "sources"
SOURCE.mkdir(parents=True, exist_ok=True)

UA = "Mozilla/5.0 Mission1000/4.2"

ATP_PLAYERS = "https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_players.csv"
ATP_RANKINGS = "https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_rankings_20s.csv"

# IMPORTANT:
# Jeff Sackmann's WTA repo does not expose the old wta_players.csv /
# wta_rankings_20s.csv URLs we previously assumed. It DOES expose the
# current-season match file. That file contains winner/loser names,
# countries, ranks and ranking points for each match.
WTA_MATCHES = "https://raw.githubusercontent.com/JeffSackmann/tennis_wta/master/wta_matches_2026.csv"

def fetch(url):
    print("Lade:", url)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        text = r.read().decode("utf-8", errors="replace")
    if not text.strip():
        raise RuntimeError("Leere Antwort")
    print("OK:", url)
    return text

def rows(text):
    return list(csv.DictReader(io.StringIO(text)))

def clean(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()

def num(v):
    try:
        s = clean(v).replace(",", "")
        return int(float(s)) if s else None
    except Exception:
        return None

def norm_name(v):
    return re.sub(r"[^a-z0-9]", "", clean(v).casefold())

def save(path, payload):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)

def atp_snapshot():
    ptxt = fetch(ATP_PLAYERS)
    rtxt = fetch(ATP_RANKINGS)

    players = {}
    for r in rows(ptxt):
        pid = clean(r.get("player_id"))
        if not pid:
            continue
        first = r.get("name_first") if "name_first" in r else r.get("first_name")
        last  = r.get("name_last") if "name_last" in r else r.get("last_name")
        players[pid] = {
            "name": clean(f"{first or ''} {last or ''}"),
            "country": clean(r.get("ioc") or r.get("country_code"))
        }

    parsed = []
    for r in rows(rtxt):
        date = clean(r.get("ranking_date"))
        rank = num(r.get("rank") or r.get("ranking"))
        pid = clean(r.get("player") or r.get("player_id"))
        pts = num(r.get("points") or r.get("ranking_points"))
        if date and rank and pid:
            parsed.append((date, rank, pid, pts))

    if not parsed:
        raise RuntimeError("ATP: keine Rankingdaten")

    latest = max(x[0] for x in parsed)
    out = []
    for date, rank, pid, pts in parsed:
        if date != latest:
            continue
        meta = players.get(pid)
        if not meta or not meta["name"]:
            continue
        out.append({
            "tour": "ATP",
            "playerId": pid,
            "name": meta["name"],
            "country": meta["country"],
            "rank": rank,
            "points": pts,
            "rankingDate": latest,
            "rankingSource": "weekly-ranking"
        })

    out.sort(key=lambda x: x["rank"])
    print(f"ATP: {len(out)} @ {latest}")
    return latest, out

def wta_snapshot():
    text = fetch(WTA_MATCHES)
    data = rows(text)
    if not data:
        raise RuntimeError("WTA 2026 Matchdatei leer")

    # Latest observed ranking for every player.
    # Sort key: tournament date, then match number.
    latest = {}

    def absorb(r, side):
        name = clean(r.get(f"{side}_name"))
        rank = num(r.get(f"{side}_rank"))
        if not name or not rank:
            return

        date = clean(r.get("tourney_date"))
        match_num = num(r.get("match_num")) or 0
        key = norm_name(name)
        candidate = {
            "tour": "WTA",
            "playerId": clean(r.get(f"{side}_id")),
            "name": name,
            "country": clean(r.get(f"{side}_ioc")),
            "rank": rank,
            "points": num(r.get(f"{side}_rank_points")),
            "rankingDate": date,
            "rankingSource": "latest-2026-match",
            "_sort": (date, match_num)
        }

        old = latest.get(key)
        if old is None or candidate["_sort"] > old["_sort"]:
            latest[key] = candidate

    for r in data:
        absorb(r, "winner")
        absorb(r, "loser")

    out = []
    for p in latest.values():
        p.pop("_sort", None)
        out.append(p)

    out.sort(key=lambda x: x["rank"])
    if len(out) < 50:
        raise RuntimeError(f"WTA: nur {len(out)} Spieler extrahiert")

    newest_date = max(clean(r.get("tourney_date")) for r in data if clean(r.get("tourney_date")))
    print(f"WTA: {len(out)} Spieler aus 2026 Matchdaten; neuestes Turnierdatum {newest_date}")
    return newest_date, out

def main():
    print("=" * 68)
    print("MISSION 1000 RANKING COLLECTOR v4.2")
    print("WTA MATCH-RANK FALLBACK")
    print("=" * 68)

    existing_path = SOURCE / "rankings.json"
    existing = []
    if existing_path.exists():
        try:
            obj = json.loads(existing_path.read_text(encoding="utf-8"))
            existing = obj.get("players", []) if isinstance(obj, dict) else []
        except Exception:
            pass

    combined = []
    dates = {}
    success = set()
    warnings = []

    try:
        d, p = atp_snapshot()
        combined += p
        dates["ATP"] = d
        success.add("ATP")
    except Exception as e:
        warnings.append("ATP: " + str(e))
        print("ATP FEHLER:", e)

    try:
        d, p = wta_snapshot()
        combined += p
        dates["WTA"] = d
        success.add("WTA")
    except Exception as e:
        warnings.append("WTA: " + str(e))
        print("WTA FEHLER:", e)

    # Do not wipe a tour if its source is temporarily unavailable.
    for p in existing:
        tour = clean(p.get("tour")).upper()
        if tour and tour not in success:
            combined.append(p)

    if not combined:
        raise SystemExit("Keine Rankingdaten verfügbar")

    dedup = {}
    for p in combined:
        tour = clean(p.get("tour")).upper()
        name = clean(p.get("name"))
        rank = num(p.get("rank"))
        if not tour or not name or not rank:
            continue
        key = (tour, norm_name(name))
        old = dedup.get(key)
        if old is None:
            dedup[key] = p
        else:
            # Prefer newest observed date; otherwise lower rank.
            nd = clean(p.get("rankingDate"))
            od = clean(old.get("rankingDate"))
            if nd > od or (nd == od and rank < (num(old.get("rank")) or 999999)):
                dedup[key] = p

    players = list(dedup.values())
    players.sort(key=lambda p: (clean(p.get("tour")), num(p.get("rank")) or 999999))

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Mission 1000 Ranking Collector v4.2",
        "rankingDates": dates,
        "notes": {
            "WTA": "Latest observed 2026 match ranking from Jeff Sackmann current-season match data."
        },
        "warnings": warnings,
        "players": players
    }
    save(SOURCE / "rankings.json", payload)

    print()
    print("FERTIG")
    print("Rankings gesamt:", len(players))
    print("ATP:", sum(1 for p in players if p.get("tour") == "ATP"))
    print("WTA:", sum(1 for p in players if p.get("tour") == "WTA"))
    print("Ranking-Daten:", dates)
    if warnings:
        print("WARNUNGEN:", warnings)

if __name__ == "__main__":
    main()
