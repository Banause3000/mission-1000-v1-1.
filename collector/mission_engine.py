#!/usr/bin/env python3
from __future__ import annotations
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

STEPS = [
    ("Rankings", ROOT/"collector"/"fetch_rankings.py", True),
    ("Intelligence", ROOT/"collector"/"fetch_intelligence.py", False),
    ("Database", ROOT/"collector"/"build_database.py", True),
]

def run_step(name: str, script: Path, required: bool):
    print()
    print("=" * 60)
    print(f"MISSION ENGINE -> {name}")
    print("=" * 60)

    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=ROOT,
        text=True,
    )

    if result.returncode == 0:
        print(f"{name}: OK")
        return True

    print(f"{name}: FEHLER ({result.returncode})")
    if required:
        raise SystemExit(result.returncode)

    print(f"{name} ist optional. Engine läuft mit vorhandenen Daten weiter.")
    return False

def main():
    print("MISSION 1000 - MISSION ENGINE v2.4.0")

    results = {}
    for name, script, required in STEPS:
        results[name] = run_step(name, script, required)

    print()
    print("=" * 60)
    print("MISSION ENGINE SUMMARY")
    print("=" * 60)
    for name, ok in results.items():
        print(f"{name}: {'OK' if ok else 'FALLBACK'}")

if __name__ == "__main__":
    main()
