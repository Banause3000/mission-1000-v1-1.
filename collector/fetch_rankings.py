#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE = DATA / "sources"
SOURCE.mkdir(parents=True, exist_ok=True)

USER_AGENT = "Mozilla/5.0 Mission1000-RankingCollector/4.1"

ATP_PLAYERS_URLS = [
    "https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_players.csv",
    "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_players.csv",
]
ATP_RANKING_URLS = [
    "https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_rankings_20s.csv",
    "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_rankings_20s.csv",
]

WTA_OFFICIAL_URL = "https://www.wtatennis.com/rankings/singles"
ESPN_WTA_URL = "https://www.espn.com/tennis/rankings/_/type/wta"

def fetch_text(url):
    print("Lade:", url)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=40) as response:
        raw = response.read()
    text = raw.decode("utf-8", errors="replace")
    if not text.strip():
        raise RuntimeError("leere Antwort")
    print("OK:", url)
    return text

def download_first(urls):
    errors = []
    for url in urls:
        try:
            return fetch_text(url), url
        except Exception as exc:
            print("FEHLER:", exc)
            errors.append(f"{url}: {exc}")
    raise RuntimeError("Keine Quelle erreichbar:\n" + "\n".join(errors))

def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

def as_int(value):
    try:
        raw = clean(value).replace(",", "")
        if not raw:
            return None
        return int(float(raw))
    except Exception:
        return None

def parse_csv(text):
    return list(csv.DictReader(io.StringIO(text)))

def atp_snapshot():
    players_text, psrc = download_first(ATP_PLAYERS_URLS)
    rankings_text, rsrc = download_first(ATP_RANKING_URLS)

    players = {}
    for row in parse_csv(players_text):
        pid = clean(row.get("player_id") or row.get("player") or row.get("id"))
        if not pid:
            continue
        name = clean(f"{row.get('name_first','')} {row.get('name_last','')}")
        players[pid] = {
            "name": name,
            "country": clean(row.get("ioc")),
        }

    rows = parse_csv(rankings_text)
    parsed = []
    for row in rows:
        date = clean(row.get("ranking_date") or row.get("date"))
        rank = as_int(row.get("rank"))
        pid = clean(row.get("player") or row.get("player_id"))
        points = as_int(row.get("points"))
        if date and rank and pid:
            parsed.append((date, rank, pid, points))

    if not parsed:
        raise RuntimeError("ATP: keine Rankingzeilen")

    newest = max(x[0] for x in parsed)
    out = []
    seen = set()

    for date, rank, pid, points in parsed:
        if date != newest or pid in seen:
            continue
        meta = players.get(pid)
        if not meta or not meta["name"]:
            continue
        seen.add(pid)
        out.append({
            "tour": "ATP",
            "playerId": pid,
            "name": meta["name"],
            "country": meta["country"],
            "rank": rank,
            "points": points,
            "rankingDate": newest,
        })

    out.sort(key=lambda x: x["rank"])
    print(f"ATP: {len(out)} Rankings @ {newest}")
    return newest, out, [psrc, rsrc]

def walk_json(node, found):
    if isinstance(node, dict):
        keys = {str(k).lower(): k for k in node.keys()}

        rank_key = next((keys[k] for k in ("rank","ranking","currentrank","current_rank") if k in keys), None)
        points_key = next((keys[k] for k in ("points","rankingpoints","ranking_points") if k in keys), None)
        name_key = next((keys[k] for k in ("name","playername","player_name","fullname","full_name") if k in keys), None)

        if rank_key and name_key:
            rank = as_int(node.get(rank_key))
            name = clean(node.get(name_key))
            if rank and name and 1 <= rank <= 2000:
                country = ""
                for ck in ("country","countrycode","country_code","ioc","nationality"):
                    if ck in keys:
                        country = clean(node.get(keys[ck]))
                        break
                points = as_int(node.get(points_key)) if points_key else None
                found.append({
                    "tour": "WTA",
                    "name": name,
                    "country": country,
                    "rank": rank,
                    "points": points,
                })

        for value in node.values():
            walk_json(value, found)

    elif isinstance(node, list):
        for value in node:
            walk_json(value, found)

def extract_json_scripts(html):
    blocks = re.findall(
        r'<script[^>]*>(.*?)</script>',
        html,
        flags=re.I | re.S
    )
    payloads = []
    for block in blocks:
        text = block.strip()
        if not text:
            continue

        candidates = [text]

        m = re.search(r'({.*})', text, flags=re.S)
        if m:
            candidates.append(m.group(1))

        for candidate in candidates:
            try:
                payloads.append(json.loads(candidate))
                break
            except Exception:
                continue

    return payloads

def dedupe_rankings(rows):
    best = {}
    for row in rows:
        rank = as_int(row.get("rank"))
        name = clean(row.get("name"))
        if not rank or not name:
            continue

        key = re.sub(r"[^a-z0-9]", "", name.casefold())
        if not key:
            continue

        current = best.get(key)
        if current is None or rank < current["rank"]:
            best[key] = {
                "tour": "WTA",
                "name": name,
                "country": clean(row.get("country")),
                "rank": rank,
                "points": as_int(row.get("points")),
            }

    result = list(best.values())
    result.sort(key=lambda x: x["rank"])
    return result

def wta_from_official():
    html = fetch_text(WTA_OFFICIAL_URL)

    found = []
    for payload in extract_json_scripts(html):
        walk_json(payload, found)

    rows = dedupe_rankings(found)

    # The official page must give us a meaningful ranking table.
    if len(rows) < 20:
        raise RuntimeError(f"WTA official parse ergab nur {len(rows)} Spieler")

    print(f"WTA official: {len(rows)} Rankings")
    return rows, WTA_OFFICIAL_URL

class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.in_tr = False
        self.in_cell = False
        self.current_row = []
        self.current_cell = []

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.in_tr = True
            self.current_row = []
        elif tag in ("td","th") and self.in_tr:
            self.in_cell = True
            self.current_cell = []

    def handle_data(self, data):
        if self.in_cell:
            self.current_cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td","th") and self.in_cell:
            self.current_row.append(clean(" ".join(self.current_cell)))
            self.in_cell = False
        elif tag == "tr" and self.in_tr:
            if self.current_row:
                self.rows.append(self.current_row)
            self.in_tr = False

def wta_from_espn():
    html = fetch_text(ESPN_WTA_URL)
    parser = TableParser()
    parser.feed(html)

    found = []
    for row in parser.rows:
        if len(row) < 2:
            continue

        rank = as_int(row[0])
        if not rank or rank > 2000:
            continue

        # ESPN typically renders: RK, NAME, POINTS, AGE
        name = clean(row[1])
        points = as_int(row[2]) if len(row) > 2 else None

        if not name or name.lower() in {"name","player"}:
            continue

        found.append({
            "tour": "WTA",
            "name": name,
            "country": "",
            "rank": rank,
            "points": points,
        })

    rows = dedupe_rankings(found)
    if len(rows) < 20:
        raise RuntimeError(f"ESPN parse ergab nur {len(rows)} Spieler")

    print(f"WTA ESPN fallback: {len(rows)} Rankings")
    return rows, ESPN_WTA_URL

def wta_snapshot():
    errors = []

    try:
        rows, source = wta_from_official()
        return rows, source
    except Exception as exc:
        print("WTA OFFICIAL FEHLER:", exc)
        errors.append(str(exc))

    try:
        rows, source = wta_from_espn()
        return rows, source
    except Exception as exc:
        print("WTA ESPN FEHLER:", exc)
        errors.append(str(exc))

    raise RuntimeError("WTA Ranking konnte nicht geladen werden: " + " | ".join(errors))

def save_json(path, payload):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)

def main():
    print("=" * 64)
    print("MISSION 1000 RANKING COLLECTOR v4.1")
    print("=" * 64)

    existing_path = SOURCE / "rankings.json"
    existing_players = []

    if existing_path.exists():
        try:
            payload = json.loads(existing_path.read_text(encoding="utf-8"))
            existing_players = payload.get("players", []) if isinstance(payload, dict) else []
        except Exception:
            existing_players = []

    merged = []
    dates = {}
    sources = []
    collected_tours = set()

    # ATP
    try:
        atp_date, atp_players, atp_sources = atp_snapshot()
        merged.extend(atp_players)
        dates["ATP"] = atp_date
        sources.extend(atp_sources)
        collected_tours.add("ATP")
    except Exception as exc:
        print("ATP FEHLER:", exc)

    # WTA
    try:
        wta_players, wta_source = wta_snapshot()
        today = datetime.now(timezone.utc).date().isoformat()
        for player in wta_players:
            player["rankingDate"] = today
        merged.extend(wta_players)
        dates["WTA"] = today
        sources.append(wta_source)
        collected_tours.add("WTA")
    except Exception as exc:
        print("WTA FEHLER:", exc)

    # Preserve previous data for a tour only if today's fetch for that tour failed.
    for player in existing_players:
        tour = str(player.get("tour") or "").upper()
        if tour and tour not in collected_tours:
            merged.append(player)

    if not merged:
        raise SystemExit("Keine Rankings verfügbar")

    # Final de-duplication by tour + normalized name.
    final = {}
    for player in merged:
        tour = str(player.get("tour") or "").upper()
        name = clean(player.get("name"))
        rank = as_int(player.get("rank"))
        if not tour or not name or not rank:
            continue
        key = (tour, re.sub(r"[^a-z0-9]", "", name.casefold()))
        current = final.get(key)
        if current is None or rank < as_int(current.get("rank")):
            final[key] = player

    players = list(final.values())
    players.sort(key=lambda p: (p.get("tour",""), as_int(p.get("rank")) or 999999, p.get("name","")))

    now = datetime.now(timezone.utc).isoformat()

    save_json(SOURCE / "rankings.json", {
        "generatedAt": now,
        "source": "Mission 1000 Ranking Collector v4.1",
        "rankingDates": dates,
        "sources": sources,
        "players": players,
    })

    print()
    print("FERTIG")
    print("Rankings gesamt:", len(players))
    print("ATP:", sum(1 for p in players if p.get("tour") == "ATP"))
    print("WTA:", sum(1 for p in players if p.get("tour") == "WTA"))
    print("Ranking-Daten:", dates)

if __name__ == "__main__":
    main()
