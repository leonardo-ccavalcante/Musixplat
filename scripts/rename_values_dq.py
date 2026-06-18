#!/usr/bin/env python3
"""Second rename pass: DOUBLE-QUOTED TS value literals the first (single-quoted/SQL) pass missed.
Only values the DB schema actually renamed to English — NOT 05A/05B values the DB kept Spanish
(directa/indirecta/ninguna/rojo/verde/destino_ruteo...). Exact "X" -> "Y" (quotes included)."""
import subprocess
from pathlib import Path

PAIRS = [
    # delta_status
    ('"mudou_cohort"', '"cohort_changed"'), ('"melhorou_percentil"', '"percentile_up"'),
    ('"baixou_percentil"', '"percentile_down"'), ('"novo"', '"new"'),
    # conversation_status
    ('"abierta"', '"open"'), ('"en_humano"', '"in_human"'), ('"escalada"', '"escalated"'),
    ('"live_aguardando_permanencia"', '"live_awaiting_retention"'),
    # percentile_mode
    ('"cualitativo_sin_percentil"', '"qualitative_no_percentile"'), ('"percentil"', '"percentile"'),
    # org_level / payment_status
    ('"equipo"', '"team"'), ('"fallido"', '"failed"'), ('"pendiente"', '"pending"'),
    # zones
    ('"centro"', '"downtown"'), ('"norte"', '"north"'), ('"sul"', '"south"'), ('"leste"', '"east"'),
    ('"oeste"', '"west"'), ('"sudeste"', '"southeast"'), ('"noroeste"', '"northwest"'), ('"litoral"', '"coast"'),
    # cuisines
    ('"brasileira"', '"brazilian"'), ('"saudavel"', '"healthy"'), ('"doces"', '"desserts"'),
    # intents
    ('"cobranca"', '"billing"'), ('"entrega"', '"delivery"'), ('"calidad"', '"quality"'),
    ('"revision_orden"', '"order_review"'), ('"cancelamento"', '"cancellation"'),
    # misc value
    ('"empresa"', '"company"'),
]

root = Path(__file__).resolve().parent.parent
files = subprocess.check_output(["git", "ls-files", "*.ts", "*.tsx"], cwd=root).decode().split()
total = 0
for rel in files:
    p = root / rel
    src = p.read_text()
    out = src
    for a, b in PAIRS:
        out = out.replace(a, b)
    if out != src:
        total += 1
        print(f"  {rel}")
        p.write_text(out)
print(f"changed {total} files")
