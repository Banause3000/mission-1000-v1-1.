#!/usr/bin/env python3
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE = DATA / "sources"
INTEL = DATA / "intelligence"

SOURCE.mkdir(parents=True, exist_ok=True)
INTEL.mkdir(parents=True, exist_ok=True)

def load_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback

def save_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)

def players_from(payload):
    if isinstance(payload, list):
        return payload
    for key in ("players", "data", "rankings", "form"):
        value = payload.get(key) if isinstance(payload, dict) else None
        if isinstance(value, list):
            return value
    return []

def matches_from(payload):
    if isinstance(payload, list):
        return payload
    for key in ("matches", "h2h", "data"):
        value = payload.get(key) if isinstance(payload, dict) else None
        if isinstance(value, list):
            return value
    return []

def merge_players(*lists):
    merged = {}
    for items in lists:
        for item in items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("player") or "").strip()
            tour = str(item.get("tour") or "").strip().upper()
            if not name:
                continue
            key = (tour, name.casefold())
            base = merged.get(key, {})
            base.update(item)
            if tour:
                base["tour"] = tour
            base["name"] = name
            merged[key] = base
    return list(merged.values())

def main():
    # Optional manually supplied source files.
    # Later, source-specific fetchers can populate these automatically.
    ranking_src = load_json(SOURCE/"rankings.json", {"players":[]})
    form_src = load_json(SOURCE/"form.json", {"players":[]})
    players_src = load_json(SOURCE/"players.json", {"players":[]})
    h2h_src = load_json(SOURCE/"h2h.json", {"matches":[]})
    surface_src = load_json(SOURCE/"surface.json", {"players":[]})
    stats_src = load_json(SOURCE/"stats.json", {"players":[]})

    # Existing app DB is also used as fallback/input.
    ranking_existing = load_json(DATA/"rankings.json", {"players":[]})
    form_existing = load_json(DATA/"form.json", {"players":[]})
    players_existing = load_json(DATA/"players.json", {"players":[]})

    rankings = merge_players(players_from(ranking_existing), players_from(ranking_src))
    forms = merge_players(players_from(form_existing), players_from(form_src))
    players = merge_players(players_from(players_existing), players_from(players_src))

    h2h = matches_from(h2h_src)
    surfaces = merge_players(players_from(surface_src))
    stats = merge_players(players_from(stats_src))

    now = datetime.now(timezone.utc).isoformat()

    save_json(DATA/"rankings.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine",
        "players": rankings
    })
    save_json(DATA/"form.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine",
        "players": forms
    })
    save_json(DATA/"players.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine",
        "players": players
    })
    save_json(INTEL/"h2h.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine",
        "matches": h2h
    })
    save_json(INTEL/"surface.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine",
        "players": surfaces
    })
    save_json(INTEL/"stats.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine",
        "players": stats
    })

    print(f"rankings: {len(rankings)}")
    print(f"form: {len(forms)}")
    print(f"players: {len(players)}")
    print(f"h2h: {len(h2h)}")
    print(f"surface: {len(surfaces)}")
    print(f"stats: {len(stats)}")

if __name__ == "__main__":
    main()
