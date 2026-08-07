#!/usr/bin/env python3
from __future__ import annotations
import csv, json, re, sys, unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

OUT = Path("data/form.json")

def norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s

ALIASES = {
    "date": ["date","match_date","event_date","start_date","start_time","start_datetime","match_datetime","time"],
    "home_name": ["home_player","home_player_name","home_name","player_home","home"],
    "away_name": ["away_player","away_player_name","away_name","player_away","away"],
    "winner_code": ["winner_code","winner","winner_side"],
    "tournament": ["tournament","tournament_name","event","event_name","competition"],
    "surface": ["surface","court_surface"],
    "tour_type": ["tour_type","level","competition_type","tournament_type","category"],
}

def pick(fieldnames, key):
    mapping = {norm(x): x for x in fieldnames}
    for alias in ALIASES[key]:
        if norm(alias) in mapping:
            return mapping[norm(alias)]
    return None

def parse_date(raw):
    raw = (raw or "").strip()
    if not raw:
        return ""
    m = re.match(r"(\d{4}-\d{2}-\d{2})", raw)
    if m:
        return m.group(1)
    for fmt in ("%d.%m.%Y","%d/%m/%Y","%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except Exception:
            pass
    return raw

def looks_challenger(row, columns):
    text = " ".join(str(row.get(c, "")) for c in columns if c).lower()
    return "challenger" in text

def load_csv(path: Path, tour: str):
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise RuntimeError(f"{path}: CSV ohne Header")

        cols = {key: pick(reader.fieldnames, key) for key in ALIASES}
        required = ["home_name","away_name","winner_code"]
        missing = [k for k in required if not cols[k]]

        if missing:
            raise RuntimeError(
                f"{path}: benoetigte Spalten nicht erkannt: {', '.join(missing)}. "
                f"Header: {', '.join(reader.fieldnames)}"
            )

        records = []
        filter_cols = [cols.get("tournament"), cols.get("tour_type")]

        for row in reader:
            if looks_challenger(row, filter_cols):
                continue

            home = (row.get(cols["home_name"]) or "").strip()
            away = (row.get(cols["away_name"]) or "").strip()
            winner = str(row.get(cols["winner_code"]) or "").strip()

            if not home or not away or winner not in {"1","2"}:
                continue

            date = parse_date(row.get(cols["date"], "") if cols["date"] else "")
            tournament = (row.get(cols["tournament"]) or "").strip() if cols["tournament"] else ""
            surface = (row.get(cols["surface"]) or "").strip() if cols["surface"] else ""

            records.append({
                "tour": tour,
                "date": date,
                "home": home,
                "away": away,
                "winner": winner,
                "tournament": tournament,
                "surface": surface
            })

        return records

def build(records):
    by_player = defaultdict(list)
    records = sorted(records, key=lambda x: x["date"] or "0000-00-00", reverse=True)

    for r in records:
        by_player[(r["tour"], r["home"])].append({
            "result": "W" if r["winner"] == "1" else "L",
            "opponent": r["away"],
            "date": r["date"],
            "surface": r["surface"] or None,
            "tournament": r["tournament"] or None
        })
        by_player[(r["tour"], r["away"])].append({
            "result": "W" if r["winner"] == "2" else "L",
            "opponent": r["home"],
            "date": r["date"],
            "surface": r["surface"] or None,
            "tournament": r["tournament"] or None
        })

    players = []
    for (tour, name), matches in sorted(by_player.items(), key=lambda x: (x[0][0], x[0][1])):
        players.append({
            "name": name,
            "tour": tour,
            "lastMatches": matches[:5]
        })

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "TennisData.App free season CSV",
        "players": players
    }

def main():
    if len(sys.argv) != 3:
        print("Usage: build_form_from_csv.py ATP.csv WTA.csv", file=sys.stderr)
        return 2

    records = load_csv(Path(sys.argv[1]), "ATP") + load_csv(Path(sys.argv[2]), "WTA")
    payload = build(records)

    if not payload["players"]:
        raise RuntimeError("Keine Spielerdaten erzeugt. form.json bleibt unveraendert.")

    tmp = OUT.with_suffix(".json.tmp")
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(OUT)

    print(f"OK: {len(payload['players'])} Spieler in {OUT}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
