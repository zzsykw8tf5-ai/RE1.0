"""
German real estate valuation per ImmoWertV 2021 (Immobilienwertermittlungsverordnung).

Implements the three standard valuation methods:
1. Ertragswertverfahren (Income Capitalization Method)
2. Vergleichswertverfahren (Sales Comparison Method)
3. Sachwertverfahren (Cost Approach Method)
"""

import math
from typing import Any


# ─── Market data defaults (representative German values) ──────────────────────

LIEGENSCHAFTSZINSSAETZE = {
    "RESIDENTIAL": 0.030,   # Einfamilienhaus / MFH: 2.5–4%
    "OFFICE":      0.050,   # Büro: 4–6%
    "RETAIL":      0.055,   # Einzelhandel: 4–7%
    "INDUSTRIAL":  0.065,   # Industrie/Logistik: 5–7%
    "MIXED":       0.045,   # Gemischt: 4–5.5%
    "HEALTHCARE":  0.055,   # Gesundheitsimmobilien: 5–6.5% (CBRE/JLL 2023)
}

NORMALHERSTELLUNGSKOSTEN_EUR_PER_BGF = {
    "RESIDENTIAL": 1_600,   # NHK 2010 × BKI-Index (ca. 2024)
    "OFFICE":      1_900,
    "RETAIL":      1_700,
    "INDUSTRIAL":  900,
    "MIXED":       1_750,
    "HEALTHCARE":  2_400,   # Pflegeheime/Kliniken: höherer Ausbaustandard
}

GESAMTNUTZUNGSDAUER = {
    "RESIDENTIAL": 80,
    "OFFICE":      60,
    "RETAIL":      50,
    "INDUSTRIAL":  40,
    "MIXED":       60,
    "HEALTHCARE":  50,      # Pflegeheime: 40–60 Jahre
}

BEWIRTSCHAFTUNGSKOSTEN_DEFAULTS = {
    "RESIDENTIAL": {
        "verwaltung_pct": 0.04,
        "instandhaltung_pct": 0.10,
        "mietausfall_pct": 0.03,
        "sonstiges_pct": 0.01,
    },
    "OFFICE": {
        "verwaltung_pct": 0.03,
        "instandhaltung_pct": 0.08,
        "mietausfall_pct": 0.05,
        "sonstiges_pct": 0.02,
    },
    "RETAIL": {
        "verwaltung_pct": 0.025,
        "instandhaltung_pct": 0.07,
        "mietausfall_pct": 0.06,
        "sonstiges_pct": 0.02,
    },
    "INDUSTRIAL": {
        "verwaltung_pct": 0.02,
        "instandhaltung_pct": 0.06,
        "mietausfall_pct": 0.04,
        "sonstiges_pct": 0.01,
    },
    "MIXED": {
        "verwaltung_pct": 0.03,
        "instandhaltung_pct": 0.08,
        "mietausfall_pct": 0.05,
        "sonstiges_pct": 0.015,
    },
    "HEALTHCARE": {
        "verwaltung_pct": 0.03,
        "instandhaltung_pct": 0.12,   # Hoher Verschleiß durch Betrieb
        "mietausfall_pct": 0.02,      # Lange Pachtverträge → geringer Leerstand
        "sonstiges_pct": 0.02,
    },
}


def _vervielfaeltiger(zinssatz: float, restnutzungsdauer: int) -> float:
    """
    Berechnung des Vervielfältigers (Rentenbarwertfaktor) gem. ImmoWertV.
    V = (1 - (1+i)^-n) / i
    """
    if zinssatz <= 0 or restnutzungsdauer <= 0:
        return restnutzungsdauer  # Sonderfall
    return (1 - (1 + zinssatz) ** (-restnutzungsdauer)) / zinssatz


def _bewirtschaftungskosten(
    jahresrohertrag: float,
    property_type: str = "OFFICE",
    custom_pct: float | None = None,
) -> tuple[float, dict]:
    """
    Berechne Bewirtschaftungskosten nach ImmoWertV §19.
    Enthält: Verwaltungskosten, Instandhaltungskosten, Mietausfallwagnis, Sonstiges.
    """
    if custom_pct is not None:
        kosten = jahresrohertrag * custom_pct
        return kosten, {
            "gesamt_pct": custom_pct,
            "gesamt_eur": round(kosten, 2),
        }

    defaults = BEWIRTSCHAFTUNGSKOSTEN_DEFAULTS.get(
        property_type, BEWIRTSCHAFTUNGSKOSTEN_DEFAULTS["OFFICE"]
    )
    verwaltung = jahresrohertrag * defaults["verwaltung_pct"]
    instandhaltung = jahresrohertrag * defaults["instandhaltung_pct"]
    mietausfall = jahresrohertrag * defaults["mietausfall_pct"]
    sonstiges = jahresrohertrag * defaults["sonstiges_pct"]
    gesamt = verwaltung + instandhaltung + mietausfall + sonstiges

    details = {
        "verwaltungskosten_eur": round(verwaltung, 2),
        "verwaltungskosten_pct": defaults["verwaltung_pct"],
        "instandhaltungskosten_eur": round(instandhaltung, 2),
        "instandhaltungskosten_pct": defaults["instandhaltung_pct"],
        "mietausfallwagnis_eur": round(mietausfall, 2),
        "mietausfallwagnis_pct": defaults["mietausfall_pct"],
        "sonstiges_eur": round(sonstiges, 2),
        "sonstiges_pct": defaults["sonstiges_pct"],
        "gesamt_eur": round(gesamt, 2),
        "gesamt_pct": round(
            defaults["verwaltung_pct"]
            + defaults["instandhaltung_pct"]
            + defaults["mietausfall_pct"]
            + defaults["sonstiges_pct"],
            4,
        ),
    }
    return gesamt, details


def ertragswertverfahren(params: dict) -> dict:
    """
    Income Capitalization Method – Ertragswertverfahren gem. ImmoWertV 2021 §§17-20.

    Required params:
        jahresrohertrag (float):           Jahresrohertrag / Gross annual rent (€)
        liegenschaftszins (float):         Liegenschaftszinssatz (e.g. 0.045)
        restnutzungsdauer (int):           Remaining useful life in years
        bodenwert (float):                 Land value (€)

    Optional params:
        bewirtschaftungskosten_pct (float): Override Bewirtschaftungskostenanteil
        property_type (str):               For default BWK lookup
        modernisierungskosten (float):     Modernisierungskosten (€, reduces value)
        besondere_objektmerkmale (float):  Sonstige wertbeeinflussende Umstände (€)
    """
    jahresrohertrag = float(params.get("jahresrohertrag", 0))
    liegenschaftszins = float(params.get("liegenschaftszins", 0.045))
    restnutzungsdauer = int(params.get("restnutzungsdauer", 30))
    bodenwert = float(params.get("bodenwert", 0))
    property_type = params.get("property_type", "OFFICE")
    modernisierungskosten = float(params.get("modernisierungskosten", 0))
    besondere_objektmerkmale = float(params.get("besondere_objektmerkmale", 0))
    custom_bwk_pct = params.get("bewirtschaftungskosten_pct")

    # Step 1: Bewirtschaftungskosten
    bwk_betrag, bwk_details = _bewirtschaftungskosten(
        jahresrohertrag,
        property_type=property_type,
        custom_pct=float(custom_bwk_pct) if custom_bwk_pct is not None else None,
    )

    # Step 2: Reinertrag (Net Operating Income)
    reinertrag = jahresrohertrag - bwk_betrag

    # Step 3: Liegenschaftszinsanteil (Return on land value)
    liegenschaftszinsanteil = bodenwert * liegenschaftszins

    # Step 4: Gebäudereinertrag
    gebaeude_reinertrag = reinertrag - liegenschaftszinsanteil

    # Step 5: Vervielfältiger
    vervielfaeltiger = _vervielfaeltiger(liegenschaftszins, restnutzungsdauer)

    # Step 6: Vorläufiger Gebäudeertragswert
    gebaeude_ertragswert_vorlaeufig = gebaeude_reinertrag * vervielfaeltiger

    # Step 7: Korrekturen (Modernisierung, besondere Merkmale)
    gebaeude_ertragswert = max(0, gebaeude_ertragswert_vorlaeufig - modernisierungskosten + besondere_objektmerkmale)

    # Step 8: Ertragswert = Bodenwert + Gebäudeertragswert
    ertragswert = bodenwert + gebaeude_ertragswert

    # Yield metrics
    bruttomietrendite = (jahresrohertrag / ertragswert * 100) if ertragswert > 0 else 0
    nettomietrendite = (reinertrag / ertragswert * 100) if ertragswert > 0 else 0
    multiplikator = ertragswert / jahresrohertrag if jahresrohertrag > 0 else 0

    return {
        "methode": "Ertragswertverfahren (ImmoWertV 2021)",
        "eingabeparameter": {
            "jahresrohertrag": round(jahresrohertrag, 2),
            "liegenschaftszinssatz": liegenschaftszins,
            "restnutzungsdauer_jahre": restnutzungsdauer,
            "bodenwert": round(bodenwert, 2),
            "modernisierungskosten": round(modernisierungskosten, 2),
        },
        "berechnungsschritte": {
            "bewirtschaftungskosten": bwk_details,
            "reinertrag": round(reinertrag, 2),
            "liegenschaftszinsanteil": round(liegenschaftszinsanteil, 2),
            "gebaeude_reinertrag": round(gebaeude_reinertrag, 2),
            "vervielfaeltiger": round(vervielfaeltiger, 4),
            "gebaeude_ertragswert_vorlaeufig": round(gebaeude_ertragswert_vorlaeufig, 2),
            "gebaeude_ertragswert_endgueltig": round(gebaeude_ertragswert, 2),
        },
        "reinertrag": round(reinertrag, 2),
        "gebaeude_ertragswert": round(gebaeude_ertragswert, 2),
        "ertragswert": round(ertragswert, 2),
        "kennzahlen": {
            "bruttomietrendite_pct": round(bruttomietrendite, 2),
            "nettomietrendite_pct": round(nettomietrendite, 2),
            "kaufpreisfaktor": round(multiplikator, 2),
            "vervielfaeltiger": round(vervielfaeltiger, 4),
        },
    }


def vergleichswertverfahren(params: dict) -> dict:
    """
    Sales Comparison Method – Vergleichswertverfahren gem. ImmoWertV 2021 §§13-16.

    Required params:
        flaeche_sqm (float):               Subject property area (m²)
        vergleichspreise (list[float]):    Comparable prices (€/m²)

    Optional params:
        lage_faktor (float):               Location adjustment factor (default 1.0)
        ausstattung_faktor (float):        Condition/quality adjustment factor (default 1.0)
        baujahr_faktor (float):            Age adjustment factor (default 1.0)
        property_type (str):               Used for context
        vergleichsobjekte (list[dict]):    Detailed comparables with adjustments
    """
    flaeche_sqm = float(params.get("flaeche_sqm", 0))
    vergleichspreise = [float(p) for p in params.get("vergleichspreise", [])]
    lage_faktor = float(params.get("lage_faktor", 1.0))
    ausstattung_faktor = float(params.get("ausstattung_faktor", 1.0))
    baujahr_faktor = float(params.get("baujahr_faktor", 1.0))
    vergleichsobjekte = params.get("vergleichsobjekte", [])

    if not vergleichspreise and not vergleichsobjekte:
        return {
            "fehler": "Keine Vergleichspreise angegeben",
            "vergleichswert": 0,
        }

    # Process detailed comparables if provided
    adjusted_prices = []
    comparable_details = []

    if vergleichsobjekte:
        for i, comp in enumerate(vergleichsobjekte):
            price_sqm = float(comp.get("price_sqm", comp.get("preis_sqm", 0)))
            adj_lage = float(comp.get("lage_anpassung", 0))
            adj_zustand = float(comp.get("zustand_anpassung", 0))
            adj_groesse = float(comp.get("groesse_anpassung", 0))
            adj_sonstige = float(comp.get("sonstige_anpassung", 0))

            angepasster_preis = price_sqm * (1 + adj_lage + adj_zustand + adj_groesse + adj_sonstige)
            adjusted_prices.append(angepasster_preis)
            comparable_details.append({
                "vergleichsobjekt": i + 1,
                "adresse": comp.get("adresse", f"Vergleichsobjekt {i+1}"),
                "preis_sqm_original": round(price_sqm, 2),
                "anpassungen_pct": {
                    "lage": adj_lage,
                    "zustand": adj_zustand,
                    "groesse": adj_groesse,
                    "sonstige": adj_sonstige,
                },
                "preis_sqm_angepasst": round(angepasster_preis, 2),
            })
    else:
        adjusted_prices = vergleichspreise
        comparable_details = [
            {
                "vergleichsobjekt": i + 1,
                "preis_sqm_original": round(p, 2),
                "preis_sqm_angepasst": round(p, 2),
            }
            for i, p in enumerate(vergleichspreise)
        ]

    # Statistical analysis of comparables
    mean_price = sum(adjusted_prices) / len(adjusted_prices)
    sorted_prices = sorted(adjusted_prices)
    median_price = sorted_prices[len(sorted_prices) // 2]
    min_price = min(adjusted_prices)
    max_price = max(adjusted_prices)

    # Spannweite prüfen (ImmoWertV: max 30% Abweichung empfohlen)
    spannweite_pct = ((max_price - min_price) / mean_price * 100) if mean_price > 0 else 0
    hinweis = None
    if spannweite_pct > 30:
        hinweis = f"Achtung: Große Spannweite der Vergleichspreise ({spannweite_pct:.1f}%). Vergleichbarkeit prüfen."

    # Marktangepasster Vergleichswert/m²
    basis_preis_sqm = median_price  # Median ist robuster

    # Apply property-specific adjustment factors
    angepasster_preis_sqm = basis_preis_sqm * lage_faktor * ausstattung_faktor * baujahr_faktor

    # Vergleichswert = Fläche × angepasster Preis/m²
    vergleichswert = flaeche_sqm * angepasster_preis_sqm

    # Also calculate based on mean
    vergleichswert_mean = flaeche_sqm * basis_preis_sqm * lage_faktor * ausstattung_faktor * baujahr_faktor

    return {
        "methode": "Vergleichswertverfahren (ImmoWertV 2021)",
        "eingabeparameter": {
            "flaeche_sqm": flaeche_sqm,
            "anzahl_vergleichsobjekte": len(adjusted_prices),
            "lage_faktor": lage_faktor,
            "ausstattung_faktor": ausstattung_faktor,
            "baujahr_faktor": baujahr_faktor,
        },
        "vergleichsobjekte": comparable_details,
        "preisanalyse": {
            "mittelwert_sqm": round(mean_price, 2),
            "median_sqm": round(median_price, 2),
            "minimum_sqm": round(min_price, 2),
            "maximum_sqm": round(max_price, 2),
            "spannweite_pct": round(spannweite_pct, 1),
            "hinweis": hinweis,
        },
        "anpassungsfaktoren": {
            "basis_preis_sqm": round(basis_preis_sqm, 2),
            "angepasster_preis_sqm": round(angepasster_preis_sqm, 2),
            "gesamtanpassung_pct": round((lage_faktor * ausstattung_faktor * baujahr_faktor - 1) * 100, 1),
        },
        "vergleichswert": round(vergleichswert, 2),
        "adjusted_value": round(vergleichswert_mean, 2),
        "vergleichswert_sqm": round(angepasster_preis_sqm, 2),
        "details": comparable_details,
    }


def sachwertverfahren(params: dict) -> dict:
    """
    Cost Approach Method – Sachwertverfahren gem. ImmoWertV 2021 §§21-23.

    Required params:
        bodenwert (float):                 Land value (€)
        baujahr (int):                     Construction year
        bgf_sqm (float):                   Brutto-Grundfläche in m²

    Optional params:
        normalherstellungskosten (float):  NHK per m² BGF (€/m², default by type)
        property_type (str):               For NHK lookup
        baumangel_abschlag (float):        Deduction for defects (€)
        marktanpassungsfaktor (float):     Market adjustment factor (default 1.0)
        bewertungsjahr (int):              Year of valuation (default current)
        bauzustand_faktor (float):         Condition factor 0.5–1.5 (default 1.0)
    """
    bodenwert = float(params.get("bodenwert", 0))
    baujahr = int(params.get("baujahr", 2000))
    bgf_sqm = float(params.get("bgf_sqm", 0))
    property_type = params.get("property_type", "OFFICE")
    marktanpassungsfaktor = float(params.get("marktanpassungsfaktor", 1.0))
    baumangel_abschlag = float(params.get("baumangel_abschlag", 0))
    bewertungsjahr = int(params.get("bewertungsjahr", 2024))
    bauzustand_faktor = float(params.get("bauzustand_faktor", 1.0))

    # Normalherstellungskosten (NHK 2010 mit BKI-Anpassung)
    nhk_default = NORMALHERSTELLUNGSKOSTEN_EUR_PER_BGF.get(property_type, 1_750)
    normalherstellungskosten = float(params.get("normalherstellungskosten", nhk_default))

    # Gesamtnutzungsdauer
    gnd = GESAMTNUTZUNGSDAUER.get(property_type, 60)

    # Tatsächliches Alter
    alter = bewertungsjahr - baujahr
    alter = max(0, alter)

    # Restnutzungsdauer
    rnd = max(0, gnd - alter)

    # Alterswertminderung nach Linearer Abschreibung (Ross-Methode)
    if gnd > 0:
        alterswertminderung_pct = min(alter / gnd, 0.80)  # max 80% Minderung
    else:
        alterswertminderung_pct = 0.80

    # Herstellungswert (Reproduktionsneubauwert)
    reproduktionsneubauwert = normalherstellungskosten * bgf_sqm * bauzustand_faktor

    # Alterswertminderung
    alterswertminderung_betrag = reproduktionsneubauwert * alterswertminderung_pct

    # Zeitwert (Gebäude) vor Marktanpassung
    gebaeude_zeitwert = reproduktionsneubauwert - alterswertminderung_betrag - baumangel_abschlag
    gebaeude_zeitwert = max(0, gebaeude_zeitwert)

    # Vorläufiger Sachwert
    vorlaeufiger_sachwert = bodenwert + gebaeude_zeitwert

    # Marktangepasster Sachwert
    sachwert = vorlaeufiger_sachwert * marktanpassungsfaktor

    return {
        "methode": "Sachwertverfahren (ImmoWertV 2021)",
        "eingabeparameter": {
            "bodenwert": round(bodenwert, 2),
            "baujahr": baujahr,
            "bgf_sqm": bgf_sqm,
            "normalherstellungskosten_sqm": round(normalherstellungskosten, 2),
            "marktanpassungsfaktor": marktanpassungsfaktor,
            "baumangel_abschlag": round(baumangel_abschlag, 2),
        },
        "berechnungsschritte": {
            "gesamtnutzungsdauer_jahre": gnd,
            "tatsaechliches_alter_jahre": alter,
            "restnutzungsdauer_jahre": rnd,
            "alterswertminderung_pct": round(alterswertminderung_pct * 100, 1),
            "reproduktionsneubauwert": round(reproduktionsneubauwert, 2),
            "alterswertminderung_eur": round(alterswertminderung_betrag, 2),
            "gebaeude_zeitwert": round(gebaeude_zeitwert, 2),
            "vorlaeufiger_sachwert": round(vorlaeufiger_sachwert, 2),
        },
        "gebaeude_sachwert": round(gebaeude_zeitwert, 2),
        "sachwert": round(sachwert, 2),
        "details": {
            "restnutzungsdauer": rnd,
            "alterswertminderung_pct": round(alterswertminderung_pct * 100, 1),
            "sachwert_sqm": round(sachwert / bgf_sqm, 2) if bgf_sqm > 0 else 0,
        },
    }


def combined_valuation(params: dict) -> dict:
    """
    Run all three valuation methods and combine with weighted average.

    params:
        All params for the three methods, plus:
        gewichtung_ertragswert (float): Weight for income method (default 0.6)
        gewichtung_vergleichswert (float): Weight for comparison method (default 0.3)
        gewichtung_sachwert (float): Weight for cost method (default 0.1)
    """
    # Weights per ImmoWertV 2021 practice:
    # Gewerbe → Ertragswert dominant
    # Wohnen  → Vergleichswert dominant
    # Industrie/Sonstige → Sachwert dominant
    property_type = params.get("property_type", "OFFICE")

    # ImmoWertV 2021: kein Methodenmix – nur das Leitverfahren
    # Gewerbe (Büro, EH, Industrie, Gemischt) → Ertragswertverfahren
    # Wohnen → Vergleichswertverfahren
    if property_type == "RESIDENTIAL":
        leitverfahren = "vergleichswert"
    else:
        leitverfahren = "ertragswert"

    # Run individual methods
    ertrag_result = ertragswertverfahren(params)
    vergleich_result = vergleichswertverfahren(params)
    sach_result = sachwertverfahren(params)

    ertragswert = ertrag_result.get("ertragswert", 0)
    vergleichswert = vergleich_result.get("vergleichswert", 0)
    sachwert = sach_result.get("sachwert", 0)

    # Verkehrswert = 100 % Leitverfahren, kein Mischen
    if leitverfahren == "vergleichswert":
        verkehrswert = vergleichswert if vergleichswert > 0 else ertragswert
        effective_weights = {
            "ertragswert": 0.0,
            "vergleichswert": 1.0 if vergleichswert > 0 else 0.0,
            "sachwert": 0.0,
        }
    else:
        verkehrswert = ertragswert
        effective_weights = {
            "ertragswert": 1.0,
            "vergleichswert": 0.0,
            "sachwert": 0.0,
        }

    # Plausibility check
    values = [v for v in [ertragswert, vergleichswert, sachwert] if v > 0]
    if values:
        min_val = min(values)
        max_val = max(values)
        spannweite_pct = ((max_val - min_val) / verkehrswert * 100) if verkehrswert > 0 else 0
        plausibilitaet = "gut" if spannweite_pct < 20 else ("akzeptabel" if spannweite_pct < 40 else "prüfen")
    else:
        spannweite_pct = 0
        plausibilitaet = "keine Daten"

    leitverfahren_label = "Vergleichswertverfahren" if leitverfahren == "vergleichswert" else "Ertragswertverfahren"

    return {
        "methode": f"{leitverfahren_label} (ImmoWertV 2021 – Leitverfahren)",
        "leitverfahren": leitverfahren,
        "einzelbewertungen": {
            "ertragswertverfahren": ertrag_result,
            "vergleichswertverfahren": vergleich_result,
            "sachwertverfahren": sach_result,
        },
        "gewichtung": effective_weights,
        "einzelwerte": {
            "ertragswert": round(ertragswert, 2),
            "vergleichswert": round(vergleichswert, 2),
            "sachwert": round(sachwert, 2),
        },
        "verkehrswert": round(verkehrswert, 2),
        "verkehrswert_gerundet": round(verkehrswert / 10_000) * 10_000,
        "plausibilitaet": {
            "bewertung": plausibilitaet,
            "spannweite_pct": round(spannweite_pct, 1),
            "hinweis": (
                "Bewertungsergebnisse weichen stark voneinander ab – Einzelergebnisse prüfen."
                if spannweite_pct > 40
                else None
            ),
        },
        "kennzahlen": ertrag_result.get("kennzahlen", {}),
    }
