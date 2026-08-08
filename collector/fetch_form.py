from pathlib import Path

print("=" * 50)
print("MISSION 1000")
print("FORM COLLECTOR")
print("=" * 50)

ROOT = Path(__file__).resolve().parents[1]

OUT = ROOT / "data" / "sources" / "form.json"

OUT.parent.mkdir(parents=True, exist_ok=True)

OUT.write_text(
"""
{
  "generatedAt":"test",
  "players":[]
}
""",
encoding="utf-8"
)

print("form.json erzeugt.")
