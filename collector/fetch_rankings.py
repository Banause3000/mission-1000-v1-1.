#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCE = DATA / "sources"
SOURCE.mkdir(parents=True, exist_ok=True)

UA = "Mozilla/5.0 Mission1000-RankingCollector/4.3"

ATP_PLAYERS = "https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_players.csv"
ATP_RANKINGS = "https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_rankings_20s.csv"

# Official WTA weekly numeric rankings PDF.
WTA_PDF = "https://wtafiles.wtatennis.com/pdf/rankings/Singles_Numeric.pdf"

def ensure_pypdf():
    try:
        import pypdf
        return pypdf
    except Exception:
        print("pypdf fehlt -> installiere pypdf ...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "--quiet", "pypdf>=5,<7"],
            check=True
        )
        import pypdf
        return pypdf

def fetch_text(url):
    print("Lade:", url)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        text = r.read().decode("utf-8", errors="replace")
    if not text.strip():
        raise RuntimeError("Leere Antwort")
    print("OK:", url)
    return text

def fetch_bytes(url):
    print("Lade:", url)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/pdf,*/*;q=0.8"
        }
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    if not data or not data.startswith(b"%PDF"):
        raise RuntimeError("WTA PDF wurde nicht als gültige PDF geliefert")
    print("OK:", url, f"({len(data)} Bytes)")
    return data

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
    ptxt = fetch_text(ATP_PLAYERS)
    rtxt = fetch_text(ATP_RANKINGS)

    players = {}
    for r in rows(ptxt):
        pid = clean(r.get("player_id"))
        if not pid:
            continue
        players[pid] = {
            "name": clean(f"{r.get('name_first','')} {r.get('name_last','')}"),
            "country": clean(r.get("ioc"))
        }

    parsed = []
    for r in rows(rtxt):
        date = clean(r.get("ranking_date"))
        rank = num(r.get("rank"))
        pid = clean(r.get("player"))
        pts = num(r.get("points"))
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
            "rankingSource": "ATP weekly CSV"
        })

    out.sort(key=lambda x: x["rank"])
    print(f"ATP: {len(out)} @ {latest}")
    return latest, out

def wta_name(pdf_name):
    # Official PDF format: SURNAME, FIRSTNAME
    raw = clean(pdf_name)
    if "," not in raw:
        return raw.title()

    surname, given = [clean(x) for x in raw.split(",", 1)]

    def pretty(part):
        # Keep apostrophes/hyphens while making ALL CAPS readable.
        return " ".join(
            "-".join(piece.capitalize() for piece in token.split("-"))
            for token in part.split()
        )

    return clean(f"{pretty(given)} {pretty(surname)}")

def is_rank_line(line):
    return bool(re.fullmatch(r"\d{1,4}", clean(line)))

def is_prior_line(line):
    return bool(re.fullmatch(r"\(\d{1,4}\)|\(-\)|-", clean(line)))

def is_name_line(line):
    text = clean(line)
    if "," not in text:
        return False
    if len(text) < 4 or len(text) > 80:
        return False
    # Avoid tournament/header lines containing commas.
    if any(word in text.upper() for word in (
        "WTA SINGLES", "AS OF:", "PRINTED:", "PAGE ", "RANK PRIOR"
    )):
        return False
    return bool(re.search(r"[A-ZÀ-ÖØ-Þ]", text))

def wta_snapshot():
    pypdf = ensure_pypdf()
    pdf = fetch_bytes(WTA_PDF)

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
        fh.write(pdf)
        pdf_path = Path(fh.name)

    try:
        reader = pypdf.PdfReader(str(pdf_path))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    finally:
        try:
            pdf_path.unlink()
        except Exception:
            pass

    if "WTA Singles Rankings" not in text:
        raise RuntimeError("WTA PDF Text konnte nicht sinnvoll extrahiert werden")

    date_match = re.search(
        r"As of:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})",
        text
    )
    ranking_date_text = date_match.group(1) if date_match else ""

    try:
        ranking_date = datetime.strptime(
            ranking_date_text, "%d %B %Y"
        ).date().isoformat()
    except Exception:
        ranking_date = datetime.now(timezone.utc).date().isoformat()

    lines = [clean(x) for x in text.splitlines() if clean(x)]
    parsed = []

    i = 0
    while i < len(lines) - 4:
        if not is_rank_line(lines[i]) or not is_prior_line(lines[i+1]) or not is_name_line(lines[i+2]):
            i += 1
            continue

        rank = num(lines[i])
        prior = lines[i+1]
        raw_name = lines[i+2]
        j = i + 3

        country = ""
        if j < len(lines) and re.fullmatch(r"[A-Z]{3}", lines[j]):
            country = lines[j]
            j += 1

        if j >= len(lines):
            break

        points = num(lines[j])

        # Sanity checks: points are numeric and rank is realistic.
        if not rank or not points or not (1 <= rank <= 2000):
            i += 1
            continue

        parsed.append({
            "tour": "WTA",
            "name": wta_name(raw_name),
            "country": country,
            "rank": rank,
            "priorRank": num(prior.strip("()")) if prior not in {"-", "(-)"} else None,
            "points": points,
            "rankingDate": ranking_date,
            "rankingSource": "WTA official Singles_Numeric.pdf"
        })

        i = j + 1

    # De-duplicate by rank/name.
    dedup = {}
    for p in parsed:
        key = (p["rank"], norm_name(p["name"]))
        dedup[key] = p

    out = list(dedup.values())
    out.sort(key=lambda p: p["rank"])

    # Strong sanity checks so bad parsing never silently overwrites good data.
    if len(out) < 500:
        raise RuntimeError(f"WTA PDF Parser fand nur {len(out)} Rankings")
    if not any(p["rank"] == 1 for p in out):
        raise RuntimeError("WTA PDF Parser fand keine #1")
    if not any(norm_name(p["name"]) == "jessicapegula" for p in out):
        raise RuntimeError("WTA PDF Parser fand Jessica Pegula nicht")

    print(f"WTA: {len(out)} @ {ranking_date}")
    print("WTA Top 5:")
    for p in out[:5]:
        print(f"  #{p['rank']} {p['name']} ({p['country'] or '-'}) {p['points']}")

    return ranking_date, out

def main():
    print("=" * 70)
    print("MISSION 1000 RANKING COLLECTOR v4.3")
    print("OFFICIAL WTA PDF")
    print("=" * 70)

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
    except Exception as exc:
        print("ATP FEHLER:", exc)
        warnings.append("ATP: " + str(exc))

    try:
        d, p = wta_snapshot()
        combined += p
        dates["WTA"] = d
        success.add("WTA")
    except Exception as exc:
        print("WTA FEHLER:", exc)
        warnings.append("WTA: " + str(exc))

    # Preserve old rankings only for tours whose fresh fetch failed.
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
            continue

        nd = clean(p.get("rankingDate"))
        od = clean(old.get("rankingDate"))
        if nd > od or (nd == od and rank < (num(old.get("rank")) or 999999)):
            dedup[key] = p

    players = list(dedup.values())
    players.sort(key=lambda p: (
        clean(p.get("tour")),
        num(p.get("rank")) or 999999,
        clean(p.get("name"))
    ))

    save(SOURCE / "rankings.json", {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Mission 1000 Ranking Collector v4.3",
        "rankingDates": dates,
        "sources": {
            "ATP": [ATP_PLAYERS, ATP_RANKINGS],
            "WTA": WTA_PDF
        },
        "warnings": warnings,
        "players": players
    })

    print()
    print("FERTIG")
    print("Rankings gesamt:", len(players))
    print("ATP:", sum(1 for p in players if p.get("tour") == "ATP"))
    print("WTA:", sum(1 for p in players if p.get("tour") == "WTA"))
    print("Ranking-Daten:", dates)

    # For quick visual validation in GitHub Actions.
    for target in ("Jessica Pegula", "Diana Shnaider", "Iga Swiatek", "Marta Kostyuk"):
        p = next((x for x in players if x.get("tour") == "WTA" and norm_name(x.get("name")) == norm_name(target)), None)
        print(target + ":", f"#{p['rank']}" if p else "NICHT GEFUNDEN")

    if warnings:
        print("WARNUNGEN:", warnings)

if __name__ == "__main__":
    main()
