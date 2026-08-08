#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

STEPS = [
    ("Rankings", ROOT / "collector" / "fetch_rankings.py"),
    ("Intelligence v3", ROOT / "collector" / "fetch_intelligence_v3.py"),
    ("Database Build", ROOT / "collector" / "build_database.py"),
]

def run(name, script):
    print()
    print("=" * 68)
    print(f"MISSION ENGINE -> {name}")
    print("=" * 68)

    result = subprocess.run([sys.executable, str(script)], cwd=ROOT)

    if result.returncode != 0:
        print(f"{name}: FEHLER")
        raise SystemExit(result.returncode)

    print(f"{name}: OK")

def main():
    print("MISSION 1000 - MISSION ENGINE v3.0")
    for name, script in STEPS:
        run(name, script)

    print()
    print("MISSION ENGINE v3: ALLES OK")

if __name__ == "__main__":
    main()
