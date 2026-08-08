#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import json
import os
import re
import urllib.request
from urllib.parse import urljoin
import html
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "sources"
INTEL = ROOT / "data" / "intelligence"
EXTERNAL = ROOT / ".external" / "tennis-source"

USER_AGENT = "Mission1000-DataEngine/6.0-WTA-H2H-WEB"

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

def normalize_player_name(value):
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text

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


TENNISDATA_DOWNLOADS_PAGE = "https://tennisdata.app/downloads/"
TENNISDATA_WTA_YEARS = list(range(2021, 2027))

def _fetch_text_generic(url, timeout=45):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 Mission1000-WTA-History/5.0",
            "Accept": "text/csv,text/plain,text/html,application/octet-stream,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": TENNISDATA_DOWNLOADS_PAGE,
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        data = response.read()
        ctype = response.headers.get("Content-Type", "")
        final_url = response.geturl()

    text = data.decode("utf-8-sig", errors="replace")
    return text, final_url, ctype

def _looks_like_tennisdata_csv(text):
    if not text or len(text) < 100:
        return False
    first = text.splitlines()[0].casefold() if text.splitlines() else ""
    useful = (
        ("home" in first and "away" in first) or
        ("winner" in first and "loser" in first)
    )
    return useful and "," in first

def _tennisdata_candidates(page_html, year):
    filename = f"{year}-wta-season.csv"
    candidates = []

    # Direct href/src URLs embedded in the page.
    for value in re.findall(r'(?:href|src)=["\']([^"\']+)["\']', page_html, flags=re.I):
        decoded = html.unescape(value).replace("\\/", "/")
        if filename.casefold() in decoded.casefold():
            candidates.append(urljoin(TENNISDATA_DOWNLOADS_PAGE, decoded))

    # Absolute/relative strings inside scripts or JSON.
    for value in re.findall(r'["\']([^"\']*' + re.escape(filename) + r'[^"\']*)["\']',
                            page_html, flags=re.I):
        decoded = html.unescape(value).replace("\\/", "/")
        candidates.append(urljoin(TENNISDATA_DOWNLOADS_PAGE, decoded))

    # Documented filename plus common static paths.
    bases = [
        TENNISDATA_DOWNLOADS_PAGE,
        "https://tennisdata.app/",
        "https://tennisdata.app/downloads/",
        "https://tennisdata.app/files/",
        "https://tennisdata.app/data/",
        "https://tennisdata.app/csv/",
        "https://tennisdata.app/assets/data/",
    ]
    for base in bases:
        candidates.append(urljoin(base, filename))

    # De-duplicate while preserving order.
    unique = []
    seen = set()
    for url in candidates:
        if url not in seen:
            seen.add(url)
            unique.append(url)
    return unique

def _pick(row, *names):
    lower = {str(k).casefold(): k for k in row.keys()}
    for name in names:
        key = lower.get(name.casefold())
        if key is not None:
            value = row.get(key)
            if value is not None and str(value).strip() != "":
                return value
    return ""

def _standardize_tennisdata_row(raw, source_name):
    """
    TennisData.app documents home/away players and winner_code 1/2.
    Keep aliases permissive so minor header changes do not break ingestion.
    """
    home = str(_pick(
        raw,
        "home_player", "home_player_name", "home_name", "player_home",
        "home"
    ) or "").strip()
    away = str(_pick(
        raw,
        "away_player", "away_player_name", "away_name", "player_away",
        "away"
    ) or "").strip()

    if not home or not away:
        # Some exports may already expose Winner/Loser.
        winner = str(_pick(raw, "winner_name", "winner", "Winner") or "").strip()
        loser = str(_pick(raw, "loser_name", "loser", "Loser") or "").strip()
    else:
        winner_code = str(_pick(raw, "winner_code", "winner", "result") or "").strip()
        if winner_code in {"1", "1.0", "H", "HOME", "home"}:
            winner, loser = home, away
        elif winner_code in {"2", "2.0", "A", "AWAY", "away"}:
            winner, loser = away, home
        else:
            winner = str(_pick(raw, "winner_name", "winner_player") or "").strip()
            loser = str(_pick(raw, "loser_name", "loser_player") or "").strip()

    if not winner or not loser:
        return None

    out = dict(raw)
    out["_tour"] = "WTA"
    out["_winner"] = normalize_player_name(winner)
    out["_loser"] = normalize_player_name(loser)
    out["_date"] = normalize_date(_pick(
        raw, "date", "match_date", "start_date", "tourney_date", "Date"
    ))
    out["_surface"] = str(_pick(
        raw, "surface", "court_surface", "Surface"
    ) or "").strip()
    out["_event"] = str(_pick(
        raw, "tournament", "tournament_name", "event", "tour_name", "Tournament"
    ) or "").strip()
    out["_source"] = source_name

    # Normalize score so build_h2h can expose it.
    score = _pick(raw, "score", "match_score", "Score")
    if score:
        out["score"] = str(score).strip()

    return out

def load_tennisdata_wta_history():
    """
    Free full-season WTA CSV history, documented for seasons 2021-2026.
    We discover the actual file URL from the download page when possible,
    then try documented/static-path fallbacks. Failure is non-fatal.
    """
    try:
        page_html, _, _ = _fetch_text_generic(TENNISDATA_DOWNLOADS_PAGE, timeout=35)
    except Exception as exc:
        print("TennisData Downloadseite optional nicht geladen:", exc)
        page_html = ""

    all_rows = []
    successful_sources = []

    for year in TENNISDATA_WTA_YEARS:
        loaded = False
        candidates = _tennisdata_candidates(page_html, year)

        print(f"TennisData WTA {year}: {len(candidates)} URL-Kandidaten")

        for url in candidates:
            try:
                text, final_url, ctype = _fetch_text_generic(url, timeout=35)
                if not _looks_like_tennisdata_csv(text):
                    continue

                reader = csv.DictReader(io.StringIO(text))
                parsed = []

                for raw in reader:
                    item = _standardize_tennisdata_row(
                        raw, f"tennisdata.app:{year}"
                    )
                    if item:
                        parsed.append(item)

                if len(parsed) < 50:
                    print(f"  Kandidat verworfen ({len(parsed)} Matches): {final_url}")
                    continue

                all_rows.extend(parsed)
                successful_sources.append(final_url)
                print(f"  OK {year}: {len(parsed)} WTA Matches aus {final_url}")
                loaded = True
                break

            except Exception:
                continue

        if not loaded:
            print(f"  WTA {year}: keine freie CSV-URL automatisch gefunden")

    print("TennisData WTA-Historie gesamt:", len(all_rows))
    return all_rows, successful_sources

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


def _slug_name(value):
    text = str(value or "").casefold()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")

def _plain_html(text):
    text = re.sub(r"<script\b[^>]*>.*?</script>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<style\b[^>]*>.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()

def _fetch_html(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 Mission1000-H2H/3.3",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    with urllib.request.urlopen(req, timeout=35) as response:
        return response.read().decode("utf-8", errors="replace")

def _wta_player_directory():
    """
    Resolve WTA profile IDs from the official player directory.
    The public links use /players/<numeric-id>/<slug>.
    """
    try:
        page = _fetch_html("https://www.wtatennis.com/players")
    except Exception as exc:
        print("WTA Player Directory optional nicht geladen:", exc)
        return {}

    directory = {}
    for pid, slug in re.findall(r'/players/(\d+)/([a-z0-9-]+)', page, flags=re.I):
        key = slug.strip("-").casefold()
        if key:
            directory[key] = pid

    print("WTA Profil-IDs gefunden:", len(directory))
    return directory

def _json_payloads_from_html(page):
    payloads = []
    for block in re.findall(r'<script[^>]*>(.*?)</script>', page, flags=re.I | re.S):
        raw = html.unescape(block.strip())
        if not raw:
            continue

        candidates = [raw]
        m = re.search(r'(\{.*\})', raw, flags=re.S)
        if m:
            candidates.append(m.group(1))

        for candidate in candidates:
            try:
                payloads.append(json.loads(candidate))
                break
            except Exception:
                pass
    return payloads

def _name_from_value(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("name","fullName","playerName","displayName"):
            if value.get(key):
                return str(value[key])
        first = value.get("firstName") or value.get("firstname") or ""
        last = value.get("lastName") or value.get("lastname") or ""
        if first or last:
            return f"{first} {last}".strip()
    return ""

def _field(obj, names):
    if not isinstance(obj, dict):
        return None
    lower = {str(k).casefold(): k for k in obj.keys()}
    for name in names:
        key = lower.get(name.casefold())
        if key is not None:
            return obj.get(key)
    return None

def _extract_official_pair_meetings(payload, player1, player2):
    """
    Walk arbitrary WTA page JSON and collect match-like objects.
    This is intentionally schema-tolerant because the WTA site can rename fields.
    """
    p1 = player1.casefold()
    p2 = player2.casefold()
    found = []

    def same(value, target):
        return normalize_player_name(_name_from_value(value)).casefold() == normalize_player_name(target).casefold()

    def walk(node):
        if isinstance(node, dict):
            values = list(node.values())

            winner = _field(node, ["winner","winnerName","winningPlayer","matchWinner"])
            loser = _field(node, ["loser","loserName","losingPlayer","matchLoser"])

            direct_result = (
                winner is not None and loser is not None and
                ((same(winner, player1) and same(loser, player2)) or
                 (same(winner, player2) and same(loser, player1)))
            )

            pa = _field(node, ["player1","playerA","homePlayer","firstPlayer"])
            pb = _field(node, ["player2","playerB","awayPlayer","secondPlayer"])
            pair_object = (
                pa is not None and pb is not None and
                ((same(pa, player1) and same(pb, player2)) or
                 (same(pa, player2) and same(pb, player1)))
            )

            if direct_result:
                win_name = normalize_player_name(_name_from_value(winner))
                lose_name = normalize_player_name(_name_from_value(loser))
                found.append({
                    "winner": win_name,
                    "loser": lose_name,
                    "date": str(_field(node, ["date","matchDate","startDate","startTime"]) or ""),
                    "event": str(_field(node, ["tournament","tournamentName","event","eventName"]) or ""),
                    "surface": str(_field(node, ["surface","courtSurface"]) or ""),
                    "score": str(_field(node, ["score","result","matchScore"]) or ""),
                })
            elif pair_object:
                # Sometimes participants and winner are separated as IDs/names.
                result = str(_field(node, ["winnerName","winner","resultWinner","winningPlayerName"]) or "")
                if result:
                    result_name = normalize_player_name(_name_from_value(result))
                    if result_name.casefold() in {normalize_player_name(player1).casefold(), normalize_player_name(player2).casefold()}:
                        other = player2 if result_name.casefold() == normalize_player_name(player1).casefold() else player1
                        found.append({
                            "winner": result_name,
                            "loser": other,
                            "date": str(_field(node, ["date","matchDate","startDate","startTime"]) or ""),
                            "event": str(_field(node, ["tournament","tournamentName","event","eventName"]) or ""),
                            "surface": str(_field(node, ["surface","courtSurface"]) or ""),
                            "score": str(_field(node, ["score","result","matchScore"]) or ""),
                        })

            for value in values:
                walk(value)

        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(payload)

    # Remove duplicate representations of the same match.
    unique = {}
    for item in found:
        key = (
            item["winner"].casefold(),
            item["loser"].casefold(),
            item["date"][:10],
            item["event"].casefold(),
            item["score"].casefold(),
        )
        unique[key] = item
    return list(unique.values())

def _official_wta_h2h(player1, player2, directory):
    id1 = directory.get(_slug_name(player1))
    id2 = directory.get(_slug_name(player2))
    if not id1 or not id2:
        return None

    url = f"https://www.wtatennis.com/head-to-head/{id1}/{id2}"
    try:
        page = _fetch_html(url)
    except Exception as exc:
        print(f"WTA H2H optional fehlgeschlagen {player1} / {player2}: {exc}")
        return None

    meetings = []
    for payload in _json_payloads_from_html(page):
        meetings.extend(_extract_official_pair_meetings(payload, player1, player2))

    # Deduplicate after combining script payloads.
    unique = {}
    for m in meetings:
        key = (
            m.get("winner","").casefold(),
            m.get("loser","").casefold(),
            m.get("date","")[:10],
            m.get("event","").casefold(),
            m.get("score","").casefold(),
        )
        unique[key] = m
    meetings = list(unique.values())

    if not meetings:
        return None

    p1wins = sum(1 for m in meetings if normalize_player_name(m["winner"]).casefold() == normalize_player_name(player1).casefold())
    p2wins = sum(1 for m in meetings if normalize_player_name(m["winner"]).casefold() == normalize_player_name(player2).casefold())

    meetings.sort(key=lambda m: m.get("date") or "", reverse=True)

    return {
        "tour": "WTA",
        "player1": player1,
        "player2": player2,
        "wins1": p1wins,
        "wins2": p2wins,
        "meetings": p1wins + p2wins,
        "lastMeeting": meetings[0] if meetings else None,
        "recentMeetings": meetings[:5],
        "source": "WTA Official H2H"
    }


def debug_pegula_shnaider_h2h(directory):
    p1 = "Jessica Pegula"
    p2 = "Diana Shnaider"

    id1 = directory.get(_slug_name(p1))
    id2 = directory.get(_slug_name(p2))

    print("=" * 64)
    print("WTA H2H DEBUG: PEGULA vs SHNAIDER")
    print("=" * 64)
    print("Pegula Profil-ID:", id1 or "NICHT GEFUNDEN")
    print("Shnaider Profil-ID:", id2 or "NICHT GEFUNDEN")

    if not id1 or not id2:
        print("DEBUG STOP: Mindestens eine Profil-ID fehlt.")
        return

    # Probe multiple public WTA URL patterns. We are not assuming one of them is
    # correct; this debug is meant to reveal which public route actually returns
    # usable H2H content from GitHub Actions.
    urls = [
        f"https://www.wtatennis.com/head-to-head/{id1}/{id2}",
        f"https://www.wtatennis.com/head-to-head/{id2}/{id1}",
        f"https://www.wtatennis.com/players/{id1}/{_slug_name(p1)}",
        f"https://www.wtatennis.com/players/{id2}/{_slug_name(p2)}",
    ]

    for url in urls:
        print()
        print("H2H Request:", url)

        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0 Mission1000-H2H-Debug/3.3.1",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
                }
            )

            with urllib.request.urlopen(req, timeout=35) as response:
                raw = response.read()
                status = getattr(response, "status", None)
                final_url = response.geturl()
                content_type = response.headers.get("Content-Type", "")

            text = raw.decode("utf-8", errors="replace")

            print("HTTP Status:", status)
            print("Final URL:", final_url)
            print("Content-Type:", content_type)
            print("Bytes:", len(raw))

            markers = {
                "Jessica Pegula": "jessica pegula" in text.casefold(),
                "Diana Shnaider": "diana shnaider" in text.casefold(),
                "Head to Head": "head to head" in text.casefold(),
                "headToHead": "headtohead" in text.casefold(),
                "__NEXT_DATA__": "__next_data__" in text.casefold(),
                "apollo": "apollo" in text.casefold(),
                "3 - 0": "3 - 0" in text,
                "4 - 0": "4 - 0" in text,
            }

            print("Marker:")
            for key, value in markers.items():
                print(f"  {key}: {value}")

            payloads = _json_payloads_from_html(text)
            print("JSON-Script-Payloads:", len(payloads))

            meetings = []
            for payload in payloads:
                meetings.extend(
                    _extract_official_pair_meetings(payload, p1, p2)
                )

            unique = {}
            for item in meetings:
                key = (
                    item.get("winner","").casefold(),
                    item.get("loser","").casefold(),
                    item.get("date","")[:10],
                    item.get("event","").casefold(),
                    item.get("score","").casefold(),
                )
                unique[key] = item

            meetings = list(unique.values())
            print("Gefundene Matches:", len(meetings))

            for index, meeting in enumerate(meetings[:10], 1):
                print(
                    f"  Match {index}: "
                    f"{meeting.get('winner','?')} d. {meeting.get('loser','?')} | "
                    f"{meeting.get('date','?')} | "
                    f"{meeting.get('event','?')} | "
                    f"{meeting.get('surface','?')} | "
                    f"{meeting.get('score','?')}"
                )

            # Print short snippets around useful markers, but never dump the whole
            # page into the workflow log.
            lower = text.casefold()
            for token in ("headtohead", "head to head", "jessica pegula", "diana shnaider"):
                pos = lower.find(token)
                if pos >= 0:
                    snippet = re.sub(r"\s+", " ", text[max(0,pos-180):pos+500])
                    print(f"Snippet [{token}]:", snippet[:700])

        except Exception as exc:
            print("REQUEST FEHLER:", type(exc).__name__, str(exc))

    print("=" * 64)
    print("WTA H2H DEBUG ENDE")
    print("=" * 64)

def supplement_current_wta_h2h(h2h):
    """
    Only query official WTA H2H for today's/current feed pairs that are missing
    from our historical database. This keeps requests tiny and targeted.
    """
    matches_path = ROOT / "data" / "matches.json"
    if not matches_path.exists():
        return h2h

    try:
        payload = json.loads(matches_path.read_text(encoding="utf-8"))
        current = payload.get("matches", []) if isinstance(payload, dict) else payload
    except Exception as exc:
        print("Current matches für WTA H2H nicht lesbar:", exc)
        return h2h

    directory = None

    def existing_record(a, b):
        aa = normalize_player_name(a).casefold()
        bb = normalize_player_name(b).casefold()
        for rec in h2h:
            x = normalize_player_name(rec.get("player1")).casefold()
            y = normalize_player_name(rec.get("player2")).casefold()
            if {x, y} == {aa, bb}:
                return rec
        return None

    checked = set()
    added = 0

    for match in current:
        if str(match.get("tour") or "").upper() != "WTA":
            continue

        p1 = normalize_player_name(match.get("player1"))
        p2 = normalize_player_name(match.get("player2"))
        if not p1 or not p2:
            continue

        pair = tuple(sorted([p1.casefold(), p2.casefold()]))
        if pair in checked:
            continue
        checked.add(pair)

        # Do not waste a request when history already has 2+ meetings.
        present = existing_record(p1, p2)
        if present and int(present.get("meetings") or 0) >= 2:
            continue

        if directory is None:
            directory = _wta_player_directory()
            if not directory:
                break

            # TEMPORARY DEBUG: diagnose the official H2H route/parser with one
            # known WTA pair before changing production H2H logic.
            debug_pegula_shnaider_h2h(directory)

        official = _official_wta_h2h(p1, p2, directory)
        if not official:
            continue

        if present:
            # Official H2H wins when it is deeper than local history.
            if int(official.get("meetings") or 0) > int(present.get("meetings") or 0):
                h2h.remove(present)
                h2h.append(official)
                added += 1
        else:
            h2h.append(official)
            added += 1

    print("WTA Official H2H ergänzt/ersetzt:", added)
    return h2h


def _web_slug(name):
    text = normalize_player_name(name).strip().casefold()
    text = text.replace("'", "")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")

def _fetch_public_page(url, timeout=30):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
                "AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
            ),
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace"), response.geturl()

def _html_text(page):
    page = re.sub(r"<script\b[^>]*>.*?</script>", " ", page, flags=re.I | re.S)
    page = re.sub(r"<style\b[^>]*>.*?</style>", " ", page, flags=re.I | re.S)
    page = re.sub(r"<[^>]+>", " ", page)
    page = html.unescape(page)
    return re.sub(r"\s+", " ", page).strip()

def _pair_order_record(player1, player2, left_name, left_wins, right_name, right_wins, source, source_url):
    p1 = normalize_player_name(player1)
    p2 = normalize_player_name(player2)
    left = normalize_player_name(left_name)
    right = normalize_player_name(right_name)

    if left.casefold() == p1.casefold() and right.casefold() == p2.casefold():
        w1, w2 = left_wins, right_wins
    elif left.casefold() == p2.casefold() and right.casefold() == p1.casefold():
        w1, w2 = right_wins, left_wins
    else:
        return None

    return {
        "tour": "WTA",
        "player1": p1,
        "player2": p2,
        "wins1": int(w1),
        "wins2": int(w2),
        "meetings": int(w1) + int(w2),
        "lastMeeting": None,
        "recentMeetings": [],
        "source": source,
        "sourceUrl": source_url,
    }

def _parse_tennisratio_h2h(page, player1, player2, url):
    text = _html_text(page)

    # TennisRatio pages expose phrases such as:
    # "Diana Shnaider and Jessica Pegula have met 4 times ..."
    # and a visible H2H record. We parse several layouts defensively.
    p1 = re.escape(normalize_player_name(player1))
    p2 = re.escape(normalize_player_name(player2))

    patterns = [
        # "H2H Record 0 - 4"
        r"H2H\s*Record\s*(\d+)\s*[-:]\s*(\d+)",
        # "Head-to-Head ... 0 - 4"
        r"Head[- ]to[- ]Head.{0,120}?(\d+)\s*[-:]\s*(\d+)",
        # generic "0 - 4 Wins"
        r"\b(\d+)\s*[-:]\s*(\d+)\s*Wins\b",
    ]

    score = None
    for rx in patterns:
        m = re.search(rx, text, flags=re.I | re.S)
        if m:
            score = (int(m.group(1)), int(m.group(2)))
            break

    if not score:
        return None

    # URL is built player1-vs-player2, and TennisRatio normally renders those
    # names in the same left/right order. Validate both names are present.
    if normalize_player_name(player1).casefold() not in text.casefold():
        return None
    if normalize_player_name(player2).casefold() not in text.casefold():
        return None

    return {
        "tour": "WTA",
        "player1": normalize_player_name(player1),
        "player2": normalize_player_name(player2),
        "wins1": score[0],
        "wins2": score[1],
        "meetings": score[0] + score[1],
        "lastMeeting": None,
        "recentMeetings": [],
        "source": "TennisRatio H2H",
        "sourceUrl": url,
    }

def _parse_tennistonic_h2h(page, player1, player2, url):
    text = _html_text(page)

    # Common public text:
    # "The head to head is 4-0 for Jessica Pegula"
    # or "Pegula leads the head to head 4-0".
    patterns = [
        r"head\s+to\s+head\s+(?:is\s+)?(\d+)\s*[-:]\s*(\d+)\s+for\s+([A-Za-z .'-]+)",
        r"([A-Za-z .'-]+)\s+leads\s+(?:the\s+)?head\s+to\s+head\s+(\d+)\s*[-:]\s*(\d+)",
    ]

    for idx, rx in enumerate(patterns):
        m = re.search(rx, text, flags=re.I)
        if not m:
            continue

        if idx == 0:
            a, b, leader = int(m.group(1)), int(m.group(2)), normalize_player_name(m.group(3))
        else:
            leader, a, b = normalize_player_name(m.group(1)), int(m.group(2)), int(m.group(3))

        p1 = normalize_player_name(player1)
        p2 = normalize_player_name(player2)

        if leader.casefold() == p1.casefold():
            return {
                "tour":"WTA","player1":p1,"player2":p2,
                "wins1":a,"wins2":b,"meetings":a+b,
                "lastMeeting":None,"recentMeetings":[],
                "source":"TennisTonic H2H","sourceUrl":url,
            }
        if leader.casefold() == p2.casefold():
            return {
                "tour":"WTA","player1":p1,"player2":p2,
                "wins1":b,"wins2":a,"meetings":a+b,
                "lastMeeting":None,"recentMeetings":[],
                "source":"TennisTonic H2H","sourceUrl":url,
            }

    return None

def fetch_external_wta_h2h(player1, player2):
    """
    Current-match H2H fallback. Query two public H2H pages.
    Nothing is guessed: if neither page yields a parseable record, return None.
    """
    s1 = _web_slug(player1)
    s2 = _web_slug(player2)

    candidates = [
        (
            f"https://www.tennisratio.com/h2h-compare/{s1}-vs-{s2}.html",
            _parse_tennisratio_h2h,
        ),
        (
            f"https://www.tennisratio.com/h2h-compare/{s2}-vs-{s1}.html",
            lambda page, a, b, url: _parse_tennisratio_h2h(page, b, a, url),
        ),
        (
            f"https://tennistonic.com/head-to-head-compare/{s1.title()}-Vs-{s2.title()}/",
            _parse_tennistonic_h2h,
        ),
        (
            f"https://tennistonic.com/head-to-head-compare/{s2.title()}-Vs-{s1.title()}/",
            lambda page, a, b, url: _parse_tennistonic_h2h(page, b, a, url),
        ),
    ]

    for url, parser in candidates:
        try:
            page, final_url = _fetch_public_page(url)
            record = parser(page, player1, player2, final_url)
            if record and int(record.get("meetings") or 0) > 0:
                print(
                    f"WTA H2H WEB OK: {player1} vs {player2} -> "
                    f"{record['wins1']}:{record['wins2']} "
                    f"({record['source']})"
                )
                return record
        except Exception as exc:
            print(
                f"WTA H2H WEB optional fehlgeschlagen: "
                f"{player1} vs {player2} | {type(exc).__name__}: {exc}"
            )

    return None

def supplement_current_wta_h2h_web(h2h):
    """
    Only current WTA pairs are checked. Existing local history wins unless the
    web fallback contains strictly more meetings.
    """
    matches_path = ROOT / "data" / "matches.json"
    if not matches_path.exists():
        return h2h

    try:
        payload = json.loads(matches_path.read_text(encoding="utf-8"))
        matches = payload.get("matches", []) if isinstance(payload, dict) else payload
    except Exception as exc:
        print("WTA H2H current matches nicht lesbar:", exc)
        return h2h

    def find_record(a, b):
        aa = normalize_player_name(a).casefold()
        bb = normalize_player_name(b).casefold()
        for rec in h2h:
            if str(rec.get("tour") or "").upper() != "WTA":
                continue
            x = normalize_player_name(rec.get("player1")).casefold()
            y = normalize_player_name(rec.get("player2")).casefold()
            if {x, y} == {aa, bb}:
                return rec
        return None

    checked = set()
    changed = 0

    for m in matches:
        if str(m.get("tour") or "").upper() != "WTA":
            continue

        p1 = normalize_player_name(m.get("player1"))
        p2 = normalize_player_name(m.get("player2"))
        if not p1 or not p2:
            continue

        key = tuple(sorted((p1.casefold(), p2.casefold())))
        if key in checked:
            continue
        checked.add(key)

        local = find_record(p1, p2)
        external = fetch_external_wta_h2h(p1, p2)
        if not external:
            continue

        local_n = int(local.get("meetings") or 0) if local else 0
        ext_n = int(external.get("meetings") or 0)

        if ext_n <= local_n:
            continue

        if local:
            h2h.remove(local)
        h2h.append(external)
        changed += 1

    print("WTA H2H WEB ergänzt/ersetzt:", changed)
    return h2h

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
    print("MISSION 1000 DATA ENGINE v6.0 WTA H2H WEB FALLBACK")
    print("RUNNING FILE: collector/fetch_intelligence_v6_wta_h2h.py")
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

    # Additional free WTA full-season history (2021-2026).
    # This fills the historical gap left by the unavailable old WTA GitHub URLs
    # and is especially important for H2H.
    # TennisData.app blocks GitHub Actions with HTTP 403, so v6 no longer
    # depends on it. Historical extension data remains in the existing scan.

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
    h2h = supplement_current_wta_h2h_web(h2h)

    # Targeted sanity check for the pair that exposed the WTA-history gap.
    peg = normalize_player_name("Jessica Pegula").casefold()
    shn = normalize_player_name("Diana Shnaider").casefold()
    peg_shn = next((
        rec for rec in h2h
        if rec.get("tour") == "WTA"
        and {
            normalize_player_name(rec.get("player1")).casefold(),
            normalize_player_name(rec.get("player2")).casefold()
        } == {peg, shn}
    ), None)

    if peg_shn:
        print(
            "H2H CHECK Pegula/Shnaider:",
            f"{peg_shn.get('wins1')}:{peg_shn.get('wins2')}",
            "Meetings:", peg_shn.get("meetings")
        )
        for m in peg_shn.get("recentMeetings", []):
            print(
                "  H2H MATCH:",
                m.get("date"),
                "|", m.get("event"),
                "|", m.get("surface"),
                "|", m.get("winner"),
                "d.", m.get("loser"),
                "|", m.get("score")
            )
    else:
        print("H2H CHECK Pegula/Shnaider: NICHT GEFUNDEN")

    surface = build_surface(rows)
    stats = build_stats(rows)
    tournament_surfaces = build_tournament_surfaces(rows)

    if not form:
        raise RuntimeError("Form Engine erzeugte 0 Spieler. Kein stilles Leerschreiben erlaubt.")

    now = now_iso()

    save_json(SOURCE / "rankings_fallback.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v6.0 - latest observed match rankings",
        "players": ranking_fallback,
    })

    save_json(SOURCE / "players.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v6.0",
        "players": players,
    })

    save_json(SOURCE / "form.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v6.0",
        "players": form,
    })

    save_json(SOURCE / "h2h.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v6.0",
        "matches": h2h,
    })

    save_json(SOURCE / "surface.json", {
        "generatedAt": now,
        "source": "Mission 1000 Data Engine v6.0",
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
    print("DATA ENGINE v6.0 WTA H2H WEB FALLBACK: OK")

if __name__ == "__main__":
    main()
