"""
Market data service – German real estate market data by city and property type.
Sources: JLL, CBRE, BNP Paribas Real Estate, gif Gesellschaft für Immobilienwirtschaftliche Forschung (2024).
"""
from __future__ import annotations
from typing import TypedDict
import unicodedata
import re


# ── Type definitions ──────────────────────────────────────────────────────────

class RentRange(TypedDict):
    min: float
    avg: float
    max: float
    prime: float


class CityEntry(TypedDict):
    tier: str                    # "A", "B", "C"
    OFFICE: RentRange
    RESIDENTIAL: RentRange
    RETAIL: RentRange
    INDUSTRIAL: RentRange
    MIXED: RentRange
    bodenrichtwert_wohn: int     # €/m² residential land
    bodenrichtwert_gewerbe: int  # €/m² commercial land
    cap_rate_min: float
    cap_rate_avg: float
    cap_rate_max: float
    vacancy_rate: float          # typical stabilised vacancy
    multiplier_avg: float        # Kaufpreisfaktor (1 / cap_rate_avg)


# ── German City Market Database ───────────────────────────────────────────────
# Rent in €/m²/Monat (Kaltmiete).  Bodenrichtwert in €/m² (Orientierungswert).

CITY_DATA: dict[str, CityEntry] = {
    # ── A-Städte ──────────────────────────────────────────────────────────────
    "münchen": {
        "tier": "A",
        "OFFICE":      {"min": 22.0, "avg": 28.0, "max": 38.0, "prime": 47.0},
        "RESIDENTIAL": {"min": 18.0, "avg": 23.0, "max": 28.0, "prime": 32.0},
        "RETAIL":      {"min": 30.0, "avg": 55.0, "max": 120.0, "prime": 370.0},
        "INDUSTRIAL":  {"min": 8.0,  "avg": 10.5, "max": 14.0, "prime": 16.0},
        "MIXED":       {"min": 18.0, "avg": 24.0, "max": 32.0, "prime": 38.0},
        "bodenrichtwert_wohn": 5500,
        "bodenrichtwert_gewerbe": 4000,
        "cap_rate_min": 0.030, "cap_rate_avg": 0.035, "cap_rate_max": 0.045,
        "vacancy_rate": 0.04,
        "multiplier_avg": 28.6,
    },
    "berlin": {
        "tier": "A",
        "OFFICE":      {"min": 18.0, "avg": 26.0, "max": 36.0, "prime": 43.0},
        "RESIDENTIAL": {"min": 13.0, "avg": 18.0, "max": 24.0, "prime": 30.0},
        "RETAIL":      {"min": 20.0, "avg": 35.0, "max": 80.0, "prime": 300.0},
        "INDUSTRIAL":  {"min": 6.0,  "avg": 8.5,  "max": 12.0, "prime": 14.0},
        "MIXED":       {"min": 14.0, "avg": 20.0, "max": 28.0, "prime": 35.0},
        "bodenrichtwert_wohn": 800,
        "bodenrichtwert_gewerbe": 900,
        "cap_rate_min": 0.033, "cap_rate_avg": 0.040, "cap_rate_max": 0.055,
        "vacancy_rate": 0.04,
        "multiplier_avg": 25.0,
    },
    "hamburg": {
        "tier": "A",
        "OFFICE":      {"min": 16.0, "avg": 22.0, "max": 28.0, "prime": 34.0},
        "RESIDENTIAL": {"min": 13.0, "avg": 17.0, "max": 22.0, "prime": 28.0},
        "RETAIL":      {"min": 25.0, "avg": 45.0, "max": 90.0, "prime": 270.0},
        "INDUSTRIAL":  {"min": 6.0,  "avg": 8.0,  "max": 11.0, "prime": 13.0},
        "MIXED":       {"min": 13.0, "avg": 18.0, "max": 25.0, "prime": 30.0},
        "bodenrichtwert_wohn": 1200,
        "bodenrichtwert_gewerbe": 1400,
        "cap_rate_min": 0.033, "cap_rate_avg": 0.040, "cap_rate_max": 0.052,
        "vacancy_rate": 0.04,
        "multiplier_avg": 25.0,
    },
    "frankfurt": {
        "tier": "A",
        "OFFICE":      {"min": 22.0, "avg": 30.0, "max": 42.0, "prime": 52.0},
        "RESIDENTIAL": {"min": 15.0, "avg": 19.0, "max": 25.0, "prime": 32.0},
        "RETAIL":      {"min": 28.0, "avg": 50.0, "max": 100.0, "prime": 280.0},
        "INDUSTRIAL":  {"min": 7.0,  "avg": 9.5,  "max": 13.0, "prime": 15.0},
        "MIXED":       {"min": 16.0, "avg": 22.0, "max": 32.0, "prime": 40.0},
        "bodenrichtwert_wohn": 2500,
        "bodenrichtwert_gewerbe": 3000,
        "cap_rate_min": 0.030, "cap_rate_avg": 0.038, "cap_rate_max": 0.050,
        "vacancy_rate": 0.05,
        "multiplier_avg": 26.3,
    },
    "düsseldorf": {
        "tier": "A",
        "OFFICE":      {"min": 16.0, "avg": 22.0, "max": 30.0, "prime": 38.0},
        "RESIDENTIAL": {"min": 12.0, "avg": 15.0, "max": 20.0, "prime": 26.0},
        "RETAIL":      {"min": 22.0, "avg": 40.0, "max": 80.0, "prime": 240.0},
        "INDUSTRIAL":  {"min": 5.5,  "avg": 7.5,  "max": 10.0, "prime": 12.0},
        "MIXED":       {"min": 12.0, "avg": 17.0, "max": 24.0, "prime": 30.0},
        "bodenrichtwert_wohn": 1500,
        "bodenrichtwert_gewerbe": 1800,
        "cap_rate_min": 0.035, "cap_rate_avg": 0.043, "cap_rate_max": 0.055,
        "vacancy_rate": 0.06,
        "multiplier_avg": 23.3,
    },
    "köln": {
        "tier": "A",
        "OFFICE":      {"min": 14.0, "avg": 20.0, "max": 26.0, "prime": 32.0},
        "RESIDENTIAL": {"min": 12.0, "avg": 16.0, "max": 21.0, "prime": 27.0},
        "RETAIL":      {"min": 20.0, "avg": 38.0, "max": 75.0, "prime": 210.0},
        "INDUSTRIAL":  {"min": 5.0,  "avg": 7.0,  "max": 9.5,  "prime": 11.0},
        "MIXED":       {"min": 12.0, "avg": 17.0, "max": 23.0, "prime": 28.0},
        "bodenrichtwert_wohn": 900,
        "bodenrichtwert_gewerbe": 1100,
        "cap_rate_min": 0.035, "cap_rate_avg": 0.043, "cap_rate_max": 0.055,
        "vacancy_rate": 0.05,
        "multiplier_avg": 23.3,
    },
    "stuttgart": {
        "tier": "A",
        "OFFICE":      {"min": 16.0, "avg": 22.0, "max": 28.0, "prime": 34.0},
        "RESIDENTIAL": {"min": 14.0, "avg": 18.0, "max": 23.0, "prime": 29.0},
        "RETAIL":      {"min": 22.0, "avg": 40.0, "max": 80.0, "prime": 220.0},
        "INDUSTRIAL":  {"min": 6.0,  "avg": 8.0,  "max": 11.0, "prime": 13.0},
        "MIXED":       {"min": 14.0, "avg": 19.0, "max": 25.0, "prime": 31.0},
        "bodenrichtwert_wohn": 1500,
        "bodenrichtwert_gewerbe": 1800,
        "cap_rate_min": 0.033, "cap_rate_avg": 0.040, "cap_rate_max": 0.052,
        "vacancy_rate": 0.04,
        "multiplier_avg": 25.0,
    },
    # ── B-Städte ──────────────────────────────────────────────────────────────
    "hannover": {
        "tier": "B",
        "OFFICE":      {"min": 11.0, "avg": 15.0, "max": 19.0, "prime": 23.0},
        "RESIDENTIAL": {"min": 9.0,  "avg": 12.0, "max": 15.0, "prime": 18.0},
        "RETAIL":      {"min": 15.0, "avg": 25.0, "max": 50.0, "prime": 130.0},
        "INDUSTRIAL":  {"min": 4.5,  "avg": 6.0,  "max": 8.0,  "prime": 10.0},
        "MIXED":       {"min": 9.0,  "avg": 13.0, "max": 17.0, "prime": 21.0},
        "bodenrichtwert_wohn": 400,
        "bodenrichtwert_gewerbe": 500,
        "cap_rate_min": 0.042, "cap_rate_avg": 0.052, "cap_rate_max": 0.065,
        "vacancy_rate": 0.07,
        "multiplier_avg": 19.2,
    },
    "leipzig": {
        "tier": "B",
        "OFFICE":      {"min": 10.0, "avg": 14.0, "max": 18.0, "prime": 22.0},
        "RESIDENTIAL": {"min": 8.0,  "avg": 11.0, "max": 14.0, "prime": 17.0},
        "RETAIL":      {"min": 12.0, "avg": 22.0, "max": 45.0, "prime": 120.0},
        "INDUSTRIAL":  {"min": 4.0,  "avg": 5.5,  "max": 7.5,  "prime": 9.0},
        "MIXED":       {"min": 8.0,  "avg": 12.0, "max": 16.0, "prime": 19.0},
        "bodenrichtwert_wohn": 300,
        "bodenrichtwert_gewerbe": 380,
        "cap_rate_min": 0.043, "cap_rate_avg": 0.053, "cap_rate_max": 0.067,
        "vacancy_rate": 0.07,
        "multiplier_avg": 18.9,
    },
    "dresden": {
        "tier": "B",
        "OFFICE":      {"min": 9.5,  "avg": 13.0, "max": 17.0, "prime": 21.0},
        "RESIDENTIAL": {"min": 7.5,  "avg": 10.5, "max": 14.0, "prime": 17.0},
        "RETAIL":      {"min": 12.0, "avg": 20.0, "max": 42.0, "prime": 110.0},
        "INDUSTRIAL":  {"min": 3.5,  "avg": 5.0,  "max": 7.0,  "prime": 8.5},
        "MIXED":       {"min": 8.0,  "avg": 11.5, "max": 15.0, "prime": 18.0},
        "bodenrichtwert_wohn": 280,
        "bodenrichtwert_gewerbe": 350,
        "cap_rate_min": 0.045, "cap_rate_avg": 0.055, "cap_rate_max": 0.070,
        "vacancy_rate": 0.08,
        "multiplier_avg": 18.2,
    },
    "nürnberg": {
        "tier": "B",
        "OFFICE":      {"min": 12.0, "avg": 16.0, "max": 20.0, "prime": 24.0},
        "RESIDENTIAL": {"min": 10.0, "avg": 14.0, "max": 18.0, "prime": 22.0},
        "RETAIL":      {"min": 15.0, "avg": 28.0, "max": 55.0, "prime": 140.0},
        "INDUSTRIAL":  {"min": 5.0,  "avg": 6.5,  "max": 8.5,  "prime": 10.5},
        "MIXED":       {"min": 10.0, "avg": 14.0, "max": 18.0, "prime": 22.0},
        "bodenrichtwert_wohn": 600,
        "bodenrichtwert_gewerbe": 700,
        "cap_rate_min": 0.038, "cap_rate_avg": 0.048, "cap_rate_max": 0.060,
        "vacancy_rate": 0.06,
        "multiplier_avg": 20.8,
    },
    "bremen": {
        "tier": "B",
        "OFFICE":      {"min": 10.0, "avg": 14.0, "max": 17.0, "prime": 21.0},
        "RESIDENTIAL": {"min": 8.5,  "avg": 12.0, "max": 15.0, "prime": 18.0},
        "RETAIL":      {"min": 12.0, "avg": 22.0, "max": 45.0, "prime": 110.0},
        "INDUSTRIAL":  {"min": 4.0,  "avg": 5.5,  "max": 7.5,  "prime": 9.0},
        "MIXED":       {"min": 8.5,  "avg": 12.0, "max": 15.5, "prime": 19.0},
        "bodenrichtwert_wohn": 350,
        "bodenrichtwert_gewerbe": 420,
        "cap_rate_min": 0.043, "cap_rate_avg": 0.053, "cap_rate_max": 0.067,
        "vacancy_rate": 0.07,
        "multiplier_avg": 18.9,
    },
    "dortmund": {
        "tier": "B",
        "OFFICE":      {"min": 9.0,  "avg": 13.0, "max": 16.0, "prime": 20.0},
        "RESIDENTIAL": {"min": 7.5,  "avg": 10.5, "max": 13.5, "prime": 16.5},
        "RETAIL":      {"min": 11.0, "avg": 20.0, "max": 40.0, "prime": 100.0},
        "INDUSTRIAL":  {"min": 3.5,  "avg": 5.0,  "max": 7.0,  "prime": 8.5},
        "MIXED":       {"min": 7.5,  "avg": 11.0, "max": 14.5, "prime": 18.0},
        "bodenrichtwert_wohn": 300,
        "bodenrichtwert_gewerbe": 350,
        "cap_rate_min": 0.047, "cap_rate_avg": 0.057, "cap_rate_max": 0.072,
        "vacancy_rate": 0.08,
        "multiplier_avg": 17.5,
    },
    "essen": {
        "tier": "B",
        "OFFICE":      {"min": 8.5,  "avg": 12.0, "max": 15.0, "prime": 18.5},
        "RESIDENTIAL": {"min": 7.0,  "avg": 10.0, "max": 13.0, "prime": 16.0},
        "RETAIL":      {"min": 10.0, "avg": 18.0, "max": 36.0, "prime": 90.0},
        "INDUSTRIAL":  {"min": 3.5,  "avg": 4.8,  "max": 6.5,  "prime": 8.0},
        "MIXED":       {"min": 7.0,  "avg": 10.5, "max": 14.0, "prime": 17.0},
        "bodenrichtwert_wohn": 250,
        "bodenrichtwert_gewerbe": 300,
        "cap_rate_min": 0.050, "cap_rate_avg": 0.060, "cap_rate_max": 0.075,
        "vacancy_rate": 0.09,
        "multiplier_avg": 16.7,
    },
    "bonn": {
        "tier": "B",
        "OFFICE":      {"min": 12.0, "avg": 17.0, "max": 22.0, "prime": 27.0},
        "RESIDENTIAL": {"min": 11.0, "avg": 15.0, "max": 19.0, "prime": 24.0},
        "RETAIL":      {"min": 15.0, "avg": 28.0, "max": 55.0, "prime": 130.0},
        "INDUSTRIAL":  {"min": 5.0,  "avg": 6.5,  "max": 8.5,  "prime": 10.0},
        "MIXED":       {"min": 11.0, "avg": 15.0, "max": 20.0, "prime": 25.0},
        "bodenrichtwert_wohn": 700,
        "bodenrichtwert_gewerbe": 900,
        "cap_rate_min": 0.038, "cap_rate_avg": 0.047, "cap_rate_max": 0.060,
        "vacancy_rate": 0.05,
        "multiplier_avg": 21.3,
    },
    "mannheim": {
        "tier": "B",
        "OFFICE":      {"min": 11.0, "avg": 15.0, "max": 19.0, "prime": 23.0},
        "RESIDENTIAL": {"min": 9.0,  "avg": 13.0, "max": 17.0, "prime": 21.0},
        "RETAIL":      {"min": 14.0, "avg": 25.0, "max": 50.0, "prime": 120.0},
        "INDUSTRIAL":  {"min": 4.5,  "avg": 6.0,  "max": 8.0,  "prime": 9.5},
        "MIXED":       {"min": 9.0,  "avg": 13.0, "max": 17.0, "prime": 21.0},
        "bodenrichtwert_wohn": 500,
        "bodenrichtwert_gewerbe": 600,
        "cap_rate_min": 0.040, "cap_rate_avg": 0.050, "cap_rate_max": 0.063,
        "vacancy_rate": 0.06,
        "multiplier_avg": 20.0,
    },
    "karlsruhe": {
        "tier": "B",
        "OFFICE":      {"min": 12.0, "avg": 16.0, "max": 20.0, "prime": 24.0},
        "RESIDENTIAL": {"min": 10.0, "avg": 14.0, "max": 18.0, "prime": 22.0},
        "RETAIL":      {"min": 14.0, "avg": 26.0, "max": 52.0, "prime": 130.0},
        "INDUSTRIAL":  {"min": 5.0,  "avg": 6.5,  "max": 8.5,  "prime": 10.0},
        "MIXED":       {"min": 10.0, "avg": 14.0, "max": 18.0, "prime": 22.0},
        "bodenrichtwert_wohn": 550,
        "bodenrichtwert_gewerbe": 650,
        "cap_rate_min": 0.038, "cap_rate_avg": 0.048, "cap_rate_max": 0.060,
        "vacancy_rate": 0.05,
        "multiplier_avg": 20.8,
    },
    "wiesbaden": {
        "tier": "B",
        "OFFICE":      {"min": 12.0, "avg": 16.5, "max": 21.0, "prime": 26.0},
        "RESIDENTIAL": {"min": 12.0, "avg": 16.0, "max": 20.0, "prime": 25.0},
        "RETAIL":      {"min": 15.0, "avg": 28.0, "max": 56.0, "prime": 140.0},
        "INDUSTRIAL":  {"min": 5.0,  "avg": 6.5,  "max": 8.5,  "prime": 10.5},
        "MIXED":       {"min": 12.0, "avg": 16.0, "max": 20.0, "prime": 25.0},
        "bodenrichtwert_wohn": 800,
        "bodenrichtwert_gewerbe": 900,
        "cap_rate_min": 0.037, "cap_rate_avg": 0.046, "cap_rate_max": 0.058,
        "vacancy_rate": 0.05,
        "multiplier_avg": 21.7,
    },
    "münster": {
        "tier": "B",
        "OFFICE":      {"min": 11.0, "avg": 15.0, "max": 19.0, "prime": 23.0},
        "RESIDENTIAL": {"min": 10.0, "avg": 14.0, "max": 18.0, "prime": 22.0},
        "RETAIL":      {"min": 14.0, "avg": 26.0, "max": 52.0, "prime": 130.0},
        "INDUSTRIAL":  {"min": 4.5,  "avg": 6.0,  "max": 8.0,  "prime": 9.5},
        "MIXED":       {"min": 10.0, "avg": 14.0, "max": 18.0, "prime": 22.0},
        "bodenrichtwert_wohn": 600,
        "bodenrichtwert_gewerbe": 700,
        "cap_rate_min": 0.038, "cap_rate_avg": 0.047, "cap_rate_max": 0.060,
        "vacancy_rate": 0.05,
        "multiplier_avg": 21.3,
    },
    "augsburg": {
        "tier": "B",
        "OFFICE":      {"min": 10.0, "avg": 14.0, "max": 18.0, "prime": 22.0},
        "RESIDENTIAL": {"min": 10.0, "avg": 14.0, "max": 18.0, "prime": 22.0},
        "RETAIL":      {"min": 13.0, "avg": 24.0, "max": 48.0, "prime": 120.0},
        "INDUSTRIAL":  {"min": 4.5,  "avg": 6.0,  "max": 8.0,  "prime": 9.5},
        "MIXED":       {"min": 10.0, "avg": 13.5, "max": 17.0, "prime": 21.0},
        "bodenrichtwert_wohn": 500,
        "bodenrichtwert_gewerbe": 580,
        "cap_rate_min": 0.038, "cap_rate_avg": 0.048, "cap_rate_max": 0.062,
        "vacancy_rate": 0.05,
        "multiplier_avg": 20.8,
    },
    "freiburg": {
        "tier": "B",
        "OFFICE":      {"min": 12.0, "avg": 16.0, "max": 20.0, "prime": 24.0},
        "RESIDENTIAL": {"min": 12.0, "avg": 17.0, "max": 22.0, "prime": 27.0},
        "RETAIL":      {"min": 15.0, "avg": 28.0, "max": 55.0, "prime": 130.0},
        "INDUSTRIAL":  {"min": 5.0,  "avg": 6.5,  "max": 8.5,  "prime": 10.0},
        "MIXED":       {"min": 12.0, "avg": 16.0, "max": 20.0, "prime": 25.0},
        "bodenrichtwert_wohn": 700,
        "bodenrichtwert_gewerbe": 800,
        "cap_rate_min": 0.035, "cap_rate_avg": 0.044, "cap_rate_max": 0.056,
        "vacancy_rate": 0.04,
        "multiplier_avg": 22.7,
    },
    "mainz": {
        "tier": "B",
        "OFFICE":      {"min": 12.0, "avg": 17.0, "max": 21.0, "prime": 25.0},
        "RESIDENTIAL": {"min": 12.0, "avg": 16.0, "max": 20.0, "prime": 25.0},
        "RETAIL":      {"min": 15.0, "avg": 28.0, "max": 55.0, "prime": 135.0},
        "INDUSTRIAL":  {"min": 5.0,  "avg": 6.5,  "max": 8.5,  "prime": 10.0},
        "MIXED":       {"min": 12.0, "avg": 16.0, "max": 20.0, "prime": 24.0},
        "bodenrichtwert_wohn": 700,
        "bodenrichtwert_gewerbe": 850,
        "cap_rate_min": 0.037, "cap_rate_avg": 0.046, "cap_rate_max": 0.058,
        "vacancy_rate": 0.05,
        "multiplier_avg": 21.7,
    },
    "kiel": {
        "tier": "B",
        "OFFICE":      {"min": 9.0,  "avg": 12.5, "max": 16.0, "prime": 19.0},
        "RESIDENTIAL": {"min": 8.0,  "avg": 11.0, "max": 14.0, "prime": 17.0},
        "RETAIL":      {"min": 11.0, "avg": 20.0, "max": 40.0, "prime": 95.0},
        "INDUSTRIAL":  {"min": 3.5,  "avg": 5.0,  "max": 7.0,  "prime": 8.5},
        "MIXED":       {"min": 8.0,  "avg": 11.0, "max": 14.0, "prime": 18.0},
        "bodenrichtwert_wohn": 300,
        "bodenrichtwert_gewerbe": 360,
        "cap_rate_min": 0.045, "cap_rate_avg": 0.055, "cap_rate_max": 0.070,
        "vacancy_rate": 0.07,
        "multiplier_avg": 18.2,
    },
    "magdeburg": {
        "tier": "C",
        "OFFICE":      {"min": 7.0,  "avg": 10.0, "max": 13.0, "prime": 16.0},
        "RESIDENTIAL": {"min": 6.0,  "avg": 8.5,  "max": 11.0, "prime": 13.5},
        "RETAIL":      {"min": 8.0,  "avg": 15.0, "max": 30.0, "prime": 70.0},
        "INDUSTRIAL":  {"min": 3.0,  "avg": 4.0,  "max": 5.5,  "prime": 7.0},
        "MIXED":       {"min": 6.0,  "avg": 9.0,  "max": 12.0, "prime": 15.0},
        "bodenrichtwert_wohn": 150,
        "bodenrichtwert_gewerbe": 180,
        "cap_rate_min": 0.055, "cap_rate_avg": 0.068, "cap_rate_max": 0.085,
        "vacancy_rate": 0.10,
        "multiplier_avg": 14.7,
    },
}

# City name aliases (handles variations)
_ALIASES: dict[str, str] = {
    "muenchen": "münchen",
    "munich": "münchen",
    "koeln": "köln",
    "cologne": "köln",
    "duesseldorf": "düsseldorf",
    "duisburg": "essen",        # proxy
    "bochum": "dortmund",       # proxy
    "bielefeld": "hannover",    # proxy
    "halle": "leipzig",         # proxy
    "rostock": "kiel",          # proxy
    "erfurt": "magdeburg",      # proxy
    "nuremberg": "nürnberg",
    "nuernberg": "nürnberg",
    "frankfurt am main": "frankfurt",
    "frankfurt/main": "frankfurt",
    "frankfurt a.m.": "frankfurt",
}

# Default fallback for unknown cities (C-Lage)
_DEFAULT_ENTRY: CityEntry = {
    "tier": "C",
    "OFFICE":      {"min": 7.0,  "avg": 10.0, "max": 13.0, "prime": 16.0},
    "RESIDENTIAL": {"min": 6.0,  "avg": 8.5,  "max": 11.0, "prime": 14.0},
    "RETAIL":      {"min": 8.0,  "avg": 15.0, "max": 30.0, "prime": 70.0},
    "INDUSTRIAL":  {"min": 3.0,  "avg": 4.5,  "max": 6.0,  "prime": 7.5},
    "MIXED":       {"min": 6.0,  "avg": 9.5,  "max": 13.0, "prime": 16.0},
    "bodenrichtwert_wohn": 120,
    "bodenrichtwert_gewerbe": 150,
    "cap_rate_min": 0.055, "cap_rate_avg": 0.070, "cap_rate_max": 0.090,
    "vacancy_rate": 0.10,
    "multiplier_avg": 14.3,
}

# Cost assumptions by property type (non-recoverable Bewirtschaftungskosten)
# Based on II. BV / gif recommendations
COST_DEFAULTS: dict[str, dict] = {
    "OFFICE": {
        "verwaltung_pct": 0.03,       # % of gross rent
        "instandhaltung_per_sqm": 12.0,   # €/m²/Jahr
        "versicherung_per_sqm": 0.50,     # €/m²/Jahr
        "sonstige_pct": 0.02,             # % of gross rent
        "nicht_umlagefaehig_pct": 0.15,   # % of gross rent (Bewirtschaftungskosten ges.)
        "mietverlust_pct_note": "Leerstand gem. Stadtlage",
    },
    "RESIDENTIAL": {
        "verwaltung_pct": 0.025,
        "instandhaltung_per_sqm": 10.0,
        "versicherung_per_sqm": 0.40,
        "sonstige_pct": 0.015,
        "nicht_umlagefaehig_pct": 0.12,
        "mietverlust_pct_note": "typisch 2-4 %",
    },
    "RETAIL": {
        "verwaltung_pct": 0.025,
        "instandhaltung_per_sqm": 8.0,
        "versicherung_per_sqm": 0.45,
        "sonstige_pct": 0.02,
        "nicht_umlagefaehig_pct": 0.13,
        "mietverlust_pct_note": "stark lageabhängig",
    },
    "INDUSTRIAL": {
        "verwaltung_pct": 0.02,
        "instandhaltung_per_sqm": 6.0,
        "versicherung_per_sqm": 0.35,
        "sonstige_pct": 0.015,
        "nicht_umlagefaehig_pct": 0.10,
        "mietverlust_pct_note": "typisch 4-7 %",
    },
    "MIXED": {
        "verwaltung_pct": 0.028,
        "instandhaltung_per_sqm": 11.0,
        "versicherung_per_sqm": 0.45,
        "sonstige_pct": 0.018,
        "nicht_umlagefaehig_pct": 0.13,
        "mietverlust_pct_note": "abhängig von Mietermix",
    },
}


def _normalize_city(city: str) -> str:
    """Normalize city name for lookup: lowercase, remove accents, strip."""
    city = city.strip().lower()
    # Normalize unicode (handle ä,ö,ü variants)
    city = unicodedata.normalize("NFC", city)
    # Remove common suffixes
    city = re.sub(r"\s*(am\s+main|a\.m\.|/main)\s*$", "", city)
    return _ALIASES.get(city, city)


def get_city_data(city: str) -> tuple[CityEntry, str]:
    """Return (CityEntry, normalized_city_name). Falls back to default for unknown cities."""
    key = _normalize_city(city)
    if key in CITY_DATA:
        return CITY_DATA[key], key
    # Partial match (e.g. "Frankfurt am Main" → "frankfurt")
    for k in CITY_DATA:
        if k in key or key in k:
            return CITY_DATA[k], k
    return _DEFAULT_ENTRY, key


def get_market_data(
    city: str,
    property_type: str,
    area_sqm: float | None = None,
    purchase_price: float | None = None,
    construction_year: int | None = None,
) -> dict:
    """
    Return comprehensive market data estimate for a property.
    All monetary values in €.
    """
    entry, matched_city = get_city_data(city)
    ptype = property_type.upper() if property_type else "OFFICE"
    if ptype not in entry:
        ptype = "OFFICE"

    rent = entry[ptype]  # type: ignore[literal-required]
    costs = COST_DEFAULTS.get(ptype, COST_DEFAULTS["OFFICE"])
    area = area_sqm or 1000.0

    # Instandhaltung adjustment by building age
    instand = costs["instandhaltung_per_sqm"]
    if construction_year:
        age = 2024 - construction_year
        if age > 30:
            instand = round(instand * 1.4, 1)
        elif age > 15:
            instand = round(instand * 1.15, 1)

    annual_rent_avg = rent["avg"] * area * 12
    annual_rent_min = rent["min"] * area * 12
    annual_rent_max = rent["max"] * area * 12

    # Estimated yield / Vervielfältiger
    impl_yield = (purchase_price and annual_rent_avg / purchase_price) or entry["cap_rate_avg"]
    impl_mult = round(1 / impl_yield, 1) if impl_yield else entry["multiplier_avg"]

    return {
        "city": city,
        "matched_city": matched_city,
        "market_tier": entry["tier"],
        "property_type": ptype,
        "area_sqm": area,
        "market_rent": {
            "min_per_sqm": rent["min"],
            "avg_per_sqm": rent["avg"],
            "max_per_sqm": rent["max"],
            "prime_per_sqm": rent["prime"],
            "unit": "€/m²/Monat",
            "annual_at_min": round(annual_rent_min),
            "annual_at_avg": round(annual_rent_avg),
            "annual_at_max": round(annual_rent_max),
        },
        "bodenrichtwert": {
            "wohn_min": round(entry["bodenrichtwert_wohn"] * 0.6),
            "wohn_avg": entry["bodenrichtwert_wohn"],
            "gewerbe_min": round(entry["bodenrichtwert_gewerbe"] * 0.6),
            "gewerbe_avg": entry["bodenrichtwert_gewerbe"],
            "unit": "€/m²",
            "note": f"Orientierungswert für {city.title()} ({entry['tier']}-Lage). Offizielle Auskunft beim Gutachterausschuss.",
        },
        "cap_rate": {
            "min": entry["cap_rate_min"],
            "avg": entry["cap_rate_avg"],
            "max": entry["cap_rate_max"],
            "implied": round(impl_yield, 4) if impl_yield else None,
        },
        "multiplier": {
            "min": round(1 / entry["cap_rate_max"], 1),
            "avg": entry["multiplier_avg"],
            "max": round(1 / entry["cap_rate_min"], 1),
            "implied": impl_mult,
        },
        "vacancy_rate_typical": entry["vacancy_rate"],
        "cost_defaults": {
            "vacancy_rate": entry["vacancy_rate"],
            "verwaltung_pct": costs["verwaltung_pct"],
            "instandhaltung_per_sqm": instand,
            "instandhaltung_annual": round(instand * area),
            "versicherung_per_sqm": costs["versicherung_per_sqm"],
            "versicherung_annual": round(costs["versicherung_per_sqm"] * area),
            "sonstige_pct": costs["sonstige_pct"],
            "nicht_umlagefaehig_pct": costs["nicht_umlagefaehig_pct"],
            "note": costs["mietverlust_pct_note"],
        },
        "data_sources": "JLL, CBRE, BNP Paribas Real Estate – Marktberichte 2024. Nur Orientierungswerte.",
    }
