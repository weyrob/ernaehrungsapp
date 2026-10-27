"""Wandelt die offizielle BLS-4.0-Datei in data/bls.json für die App um.

Aufruf (Python 3 + openpyxl):
    pip install openpyxl
    python3 tools/convert_bls.py BLS_4_0_Daten_2025_DE.xlsx data/bls.json

Quelle: Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 –
Deutsche Nährstoffdatenbank. Karlsruhe. https://blsdb.de/download – Lizenz CC BY 4.0.

Umgang mit Sonderwerten laut BLS-Dokumentation (Kap. 4.4):
    "-"            fehlender Wert   → unbekannt (nicht 0!)
    "TR"           Spuren           → 0 (Gehalt sehr gering)
    "<LOD", "<LOQ" unter Nachweis-/Bestimmungsgrenze → 0
"""

import json
import re
import sys

import openpyxl

# Unser Schlüssel → (BLS-Code(s), Faktor in unsere Einheit)
# Mehrere Codes werden addiert (EPA + DHA).
MAPPING = {
    "energy": (["ENERCC"], 1),
    "protein": (["PROT625"], 1),
    "fat": (["FAT"], 1),
    "carbs": (["CHO"], 1),
    "fiber": (["FIBT"], 1),
    "alcohol": (["ALC"], 1),
    "water": (["WATER"], 1),
    "satfat": (["FASAT"], 1),
    "mufa": (["FAMS"], 1),
    "pufa": (["FAPU"], 1),
    "omega3": (["F18:3CN3"], 1),  # Alpha-Linolensäure (DGE-Richtwert bezieht sich darauf)
    "epadha": (["F20:5CN3", "F22:6CN3"], 1000),  # g → mg
    "omega6": (["F18:2CN6"], 1),  # Linolsäure
    "cholesterol": (["CHORL"], 1),
    "sugar": (["SUGAR"], 1),
    "starch": (["STARCH"], 1),
    "salt": (["NACL"], 1),
    "vitA": (["VITAA"], 1),  # Retinol-Aktivitäts-Äquivalent, wie DGE
    "vitD": (["VITD"], 1),
    "vitE": (["VITE"], 1),
    "vitK": (["VITK"], 1),
    "vitB1": (["THIA"], 1),
    "vitB2": (["RIBF"], 1),
    "niacin": (["NIAEQ"], 1),  # Niacin-Äquivalent, wie DGE
    "vitB5": (["PANTAC"], 1),
    "vitB6": (["VITB6"], 0.001),  # BLS: µg → mg
    "biotin": (["BIOT"], 1),
    "folate": (["FOL"], 1),  # Folat-Äquivalent
    "vitB12": (["VITB12"], 1),
    "vitC": (["VITC"], 1),
    "sodium": (["NA"], 1),
    "potassium": (["K"], 1),
    "calcium": (["CA"], 1),
    "magnesium": (["MG"], 1),
    "phosphorus": (["P"], 1),
    "chloride": (["CLD"], 1),
    "iron": (["FE"], 1),
    "zinc": (["ZN"], 1),
    "copper": (["CU"], 0.001),  # BLS: µg → mg
    "manganese": (["MN"], 0.001),  # BLS: µg → mg
    "iodine": (["ID"], 1),
    "fluoride": (["FD"], 0.001),  # BLS: µg → mg
}

# Erwartete Einheiten laut BLS-Spaltenkopf – schützt vor stillen Einheitenfehlern
EXPECTED_UNITS = {
    "ENERCC": "kcal", "VITB6": "µg", "CU": "µg", "MN": "µg", "FD": "µg", "ID": "µg",
    "VITAA": "µg", "VITD": "µg", "VITK": "µg", "FOL": "µg", "VITB12": "µg", "BIOT": "µg",
    "VITE": "mg", "THIA": "mg", "RIBF": "mg", "NIAEQ": "mg", "PANTAC": "mg", "VITC": "mg",
    "NA": "mg", "K": "mg", "CA": "mg", "MG": "mg", "P": "mg", "CLD": "mg", "FE": "mg", "ZN": "mg",
    "CHORL": "mg", "NACL": "g", "PROT625": "g", "FAT": "g", "CHO": "g",
}

# Hauptgruppen nach dem ersten Buchstaben des BLS-Codes
GROUPS = {
    "B": "Brot & Brötchen",
    "C": "Getreide & Getreideprodukte",
    "D": "Backwaren & Kekse",
    "E": "Teigwaren & Eier",
    "F": "Obst",
    "G": "Gemüse",
    "H": "Hülsenfrüchte, Nüsse & Samen",
    "K": "Kartoffeln, Stärke & Pilze",
    "M": "Milch & Milchprodukte",
    "N": "Getränke",
    "P": "Alkoholische Getränke",
    "Q": "Fette & Öle",
    "R": "Gewürze, Würzmittel & Soßen",
    "S": "Süßwaren & Zucker",
    "T": "Fisch & Meeresfrüchte",
    "U": "Fleisch",
    "V": "Geflügel, Wild & Innereien",
    "W": "Wurst & Fleischwaren",
    "X": "Suppen, Soßen & Fertiggerichte",
    "Y": "Gerichte",
}

ZERO_MARKERS = {"TR", "<LOD", "<LOQ", "<LOD or <LOQ"}


def parse(v):
    """Gibt (Zahl | None) zurück. None = unbekannt."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if s in ZERO_MARKERS:
        return 0.0
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None  # "-" oder Freitext


def round_sig(x):
    if x == 0:
        return 0
    if abs(x) >= 100:
        return round(x, 1)
    if abs(x) >= 1:
        return round(x, 3)
    return float(f"{x:.4g}")


def main(src, dst):
    wb = openpyxl.load_workbook(src, read_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    header = next(rows)

    # Spaltenkopf "CODE Bezeichnung [Einheit/100g]" → Spaltennummer
    col = {}
    for i, h in enumerate(header):
        m = re.match(r"^(\S+) .*\[(.+)/100g\]$", str(h or ""))
        if m:
            col[m.group(1)] = (i, m.group(2))

    for code, unit in EXPECTED_UNITS.items():
        if col[code][1] != unit:
            sys.exit(f"Einheit für {code} ist {col[code][1]}, erwartet {unit} – bitte Umrechnung prüfen!")

    keys = list(MAPPING)
    foods = []
    for r in rows:
        code, name = r[0], r[1]
        if not code or not name:
            continue
        values = []
        for key in keys:
            codes, factor = MAPPING[key]
            parts = [parse(r[col[c][0]]) for c in codes]
            if any(p is None for p in parts):
                values.append(None)
            else:
                values.append(round_sig(sum(parts) * factor))
        foods.append([code, name.strip(), GROUPS.get(code[0], "Sonstiges"), *values])

    out = {
        "meta": {
            "source": "Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank. Karlsruhe.",
            "doi": "https://doi.org/10.25826/Data20251217-134202-0",
            "license": "CC BY 4.0",
            "note": "Werte pro 100 g essbarer Anteil, umgerechnet in die Einheiten dieser App.",
            "count": len(foods),
        },
        "nutrients": keys,
        "foods": foods,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(foods)} Lebensmittel → {dst}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
