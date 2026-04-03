# RE Analyst Pro

Professionelle Immobilien-Analyse-Webapp mit deutscher und US-Bewertung, DCF-Modell, Standortanalyse und Portfolio-Risikomanagement.

## Features

| Modul | Beschreibung |
|---|---|
| **Upload** | Excel-Vorlagen (4 Sheets) + PDF-Exposé-Parser |
| **Bewertung DE** | Ertragswert-, Vergleichswert-, Sachwertverfahren (ImmoWertV 2021) |
| **Bewertung US** | Income Approach, Sales Comparison, Cost Approach (USPAP) |
| **DCF Modell** | 10-Jahres-Cashflow, IRR, NPV, Equity Multiple, DSCR, Sensitivität |
| **Standortanalyse** | Makro (Stadt/Region) + Mikro (Nachbarschaft) mit Score 0–100 |
| **Risiko-Modell** | 6 Risikokategorien, Stress-Tests, Mieterkonzentration |
| **Szenarien** | Interaktive Slider, Szenarien speichern & vergleichen |
| **PDF Report** | Vollständiger professioneller Bericht mit allen Kennzahlen |

## Schnellstart

```bash
# Abhängigkeiten installieren
pip install -r backend/requirements.txt
cd frontend && npm install

# Starten (Backend + Frontend)
./start.sh
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Dokumentation**: http://localhost:8000/docs

## Mit Docker

```bash
docker-compose up
```

## Technologie

**Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Recharts

**Backend**: FastAPI + SQLAlchemy + SQLite + openpyxl + ReportLab

## Excel-Vorlage

Download unter: http://localhost:8000/api/upload/template

**Sheets:**
- `Objektstammdaten` – Name, Adresse, Typ, Fläche, Kaufpreis
- `Mieterliste` – Mieter, Fläche, Miete, Laufzeit, Bonität
- `Vertragsübersicht` – Vertragsdaten, Optionen, Indexierung
- `Flächenübersicht` – Nutzungsart, Fläche, Etage

## Rechtlicher Hinweis

Die Bewertungen dienen als Orientierungswerte. Für rechtsverbindliche Gutachten nach § 194 BauGB ist ein zertifizierter Sachverständiger erforderlich. US-Bewertungen erfordern einen MAI-zertifizierten Appraiser.
