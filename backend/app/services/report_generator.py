"""PDF Report Generator using ReportLab."""
import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT


# ---- Color Palette ----
BLUE = colors.HexColor("#0066CC")
DARK = colors.HexColor("#1D1D1F")
GRAY = colors.HexColor("#6E6E73")
LIGHT = colors.HexColor("#F5F5F7")
GREEN = colors.HexColor("#34C759")
RED = colors.HexColor("#FF3B30")
ORANGE = colors.HexColor("#FF9500")
WHITE = colors.white


def _fmt_eur(val: float) -> str:
    try:
        return f"€ {val:,.0f}".replace(",", ".")
    except Exception:
        return "–"


def _fmt_pct(val: float) -> str:
    try:
        return f"{val:.1f} %"
    except Exception:
        return "–"


def _fmt_num(val: float, dec: int = 0) -> str:
    try:
        return f"{val:,.{dec}f}".replace(",", ".")
    except Exception:
        return "–"


def generate_report(property_data: dict, analysis_results: dict) -> bytes:
    """Generate a professional PDF report."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title=f"RE Analyst – {property_data.get('name', 'Objekt')}",
    )

    styles = getSampleStyleSheet()
    story = []

    # ---- Cover Page ----
    story += _cover_page(property_data, styles)
    story.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT))
    story.append(Spacer(1, 0.5*cm))

    # ---- Executive Summary ----
    story += _exec_summary(property_data, analysis_results, styles)

    # ---- German Valuation ----
    if "german_valuation" in analysis_results:
        story += _german_section(analysis_results["german_valuation"], styles)

    # ---- US Valuation ----
    if "us_valuation" in analysis_results:
        story += _us_section(analysis_results["us_valuation"], styles)

    # ---- DCF Model ----
    if "dcf" in analysis_results:
        story += _dcf_section(analysis_results["dcf"], styles)

    # ---- Location ----
    if "location" in analysis_results:
        story += _location_section(analysis_results["location"], styles)

    # ---- Risk ----
    if "risk" in analysis_results:
        story += _risk_section(analysis_results["risk"], styles)

    # ---- Footer note ----
    story.append(Spacer(1, 1*cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT))
    story.append(Paragraph(
        f"Erstellt am {datetime.now().strftime('%d.%m.%Y')} · RE Analyst Pro · "
        "Dieses Dokument dient nur als Orientierungshilfe und ist kein rechtsverbindliches Gutachten.",
        ParagraphStyle("footer", parent=styles["Normal"], fontSize=7, textColor=GRAY, alignment=TA_CENTER)
    ))

    doc.build(story)
    return buf.getvalue()


def _s(name: str, styles: any, **kwargs) -> ParagraphStyle:
    p = ParagraphStyle(name, parent=styles["Normal"])
    for k, v in kwargs.items():
        setattr(p, k, v)
    return p


def _cover_page(prop: dict, styles) -> list:
    items = []
    items.append(Spacer(1, 2*cm))

    title_style = _s("title", styles, fontSize=28, textColor=DARK, spaceAfter=4, fontName="Helvetica-Bold")
    sub_style = _s("sub", styles, fontSize=14, textColor=GRAY, spaceAfter=2)
    meta_style = _s("meta", styles, fontSize=10, textColor=GRAY)

    items.append(Paragraph("RE Analyst Pro", _s("brand", styles, fontSize=11, textColor=BLUE, fontName="Helvetica-Bold")))
    items.append(Spacer(1, 0.3*cm))
    items.append(Paragraph(prop.get("name", "Immobilienanalyse"), title_style))
    items.append(Paragraph(f"{prop.get('address', '')}, {prop.get('zip_code', '')} {prop.get('city', '')}", sub_style))
    items.append(Spacer(1, 0.5*cm))

    type_map = {"RESIDENTIAL": "Wohnen", "OFFICE": "Büro", "RETAIL": "Einzelhandel",
                "INDUSTRIAL": "Industrie", "MIXED": "Gemischt"}
    ptype = type_map.get(prop.get("property_type", ""), prop.get("property_type", "–"))

    meta = [
        [prop.get("city", "–"), ptype, str(prop.get("construction_year", "–")), _fmt_eur(prop.get("purchase_price", 0))],
        ["Stadt", "Nutzungsart", "Baujahr", "Kaufpreis"],
    ]
    t = Table(meta, colWidths=[4*cm, 4*cm, 4*cm, 4*cm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 13),
        ("FONT", (0, 1), (-1, 1), "Helvetica", 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), DARK),
        ("TEXTCOLOR", (0, 1), (-1, 1), GRAY),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    items.append(t)
    items.append(Spacer(1, 0.4*cm))
    items.append(Paragraph(
        f"Analyse-Datum: {datetime.now().strftime('%d. %B %Y')}",
        meta_style,
    ))
    items.append(Spacer(1, 1*cm))
    return items


def _exec_summary(prop: dict, results: dict, styles) -> list:
    items = []
    h2 = _s("h2", styles, fontSize=14, textColor=BLUE, fontName="Helvetica-Bold", spaceAfter=8, spaceBefore=12)
    items.append(Paragraph("Executive Summary", h2))

    de = results.get("german_valuation", {})
    us = results.get("us_valuation", {})
    dcf = results.get("dcf", {})
    risk = results.get("risk", {})
    loc = results.get("location", {})

    kpis = [
        ["Kennzahl", "Wert", "Quelle"],
        ["Verkehrswert (DE)", _fmt_eur(de.get("combined", {}).get("final_value", 0)), "ImmoWertV 2021"],
        ["Indicated Value (US)", f"USD {de.get('combined', {}).get('final_value', 0) * 1.08:,.0f}", "USPAP"],
        ["Kaufpreis", _fmt_eur(prop.get("purchase_price", 0)), "Vertragsangabe"],
        ["IRR (10 Jahre)", _fmt_pct(dcf.get("metrics", {}).get("irr", 0) * 100), "DCF-Modell"],
        ["Equity Multiple", f"{dcf.get('metrics', {}).get('equity_multiple', 0):.2f}x", "DCF-Modell"],
        ["NPV", _fmt_eur(dcf.get("metrics", {}).get("npv", 0)), "DCF-Modell"],
        ["Risiko-Score", f"{risk.get('overall_risk_score', 0):.0f}/100 ({risk.get('risk_category', '–')})", "Risiko-Modell"],
        ["Standort-Score", f"{loc.get('overall_score', 0):.0f}/100", "Standortanalyse"],
        ["Bruttoanfangsrendite", _fmt_pct(de.get("combined", {}).get("gross_initial_yield", 0)), "Berechnet"],
    ]
    t = Table(kpis, colWidths=[7*cm, 5*cm, 5*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E8E8ED")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    items.append(t)
    items.append(Spacer(1, 0.5*cm))
    return items


def _section_header(title: str, styles) -> list:
    h2 = _s("h2s", styles, fontSize=13, textColor=BLUE, fontName="Helvetica-Bold", spaceAfter=6, spaceBefore=14)
    return [HRFlowable(width="100%", thickness=1, color=BLUE), Spacer(1, 0.2*cm), Paragraph(title, h2)]


def _kv_table(rows: list[tuple], styles) -> Table:
    data = [[r[0], r[1]] for r in rows]
    t = Table(data, colWidths=[8*cm, 8*cm])
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (0, -1), "Helvetica", 9),
        ("FONT", (1, 0), (1, -1), "Helvetica-Bold", 9),
        ("TEXTCOLOR", (0, 0), (0, -1), GRAY),
        ("TEXTCOLOR", (1, 0), (1, -1), DARK),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E8E8ED")),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [WHITE, LIGHT]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def _german_section(de: dict, styles) -> list:
    items = _section_header("Bewertung nach deutschem Recht (ImmoWertV 2021)", styles)
    ewv = de.get("ertragswertverfahren", {})
    combined = de.get("combined", {})
    rows = [
        ("Jahresrohertrag", _fmt_eur(ewv.get("jahresrohertrag", 0))),
        ("Reinertrag", _fmt_eur(ewv.get("reinertrag", 0))),
        ("Gebäudeertragswert", _fmt_eur(ewv.get("gebaeude_ertragswert", 0))),
        ("Ertragswert", _fmt_eur(ewv.get("ertragswert", 0))),
        ("Vergleichswert", _fmt_eur(de.get("vergleichswertverfahren", {}).get("vergleichswert", 0))),
        ("Sachwert", _fmt_eur(de.get("sachwertverfahren", {}).get("sachwert", 0))),
        ("Verkehrswert (gewichtet)", _fmt_eur(combined.get("final_value", 0))),
        ("Preis pro m²", _fmt_eur(combined.get("price_per_sqm", 0)) + "/m²"),
        ("Bruttoanfangsrendite", _fmt_pct(combined.get("gross_initial_yield", 0))),
    ]
    items.append(_kv_table(rows, styles))
    return items


def _us_section(us: dict, styles) -> list:
    items = _section_header("Bewertung nach US-Recht (USPAP)", styles)
    combined = us.get("combined", {})
    ia = us.get("income_approach", {})
    rows = [
        ("NOI", f"USD {ia.get('noi', 0):,.0f}"),
        ("Cap Rate", _fmt_pct(ia.get("cap_rate", 0))),
        ("Income Approach Value", f"USD {ia.get('value', 0):,.0f}"),
        ("Sales Comparison Value", f"USD {us.get('sales_comparison', {}).get('indicated_value', 0):,.0f}"),
        ("Cost Approach Value", f"USD {us.get('cost_approach', {}).get('total_value', 0):,.0f}"),
        ("Indicated Value (USD)", f"USD {combined.get('final_value_usd', 0):,.0f}"),
        ("Indicated Value (EUR)", _fmt_eur(combined.get("final_value_eur", 0))),
    ]
    items.append(_kv_table(rows, styles))
    return items


def _dcf_section(dcf: dict, styles) -> list:
    items = _section_header("DCF-Cashflow-Modell (10 Jahre)", styles)
    m = dcf.get("metrics", {})
    rows = [
        ("IRR (10 Jahre)", _fmt_pct(m.get("irr", 0) * 100)),
        ("NPV", _fmt_eur(m.get("npv", 0))),
        ("Equity Multiple", f"{m.get('equity_multiple', 0):.2f}x"),
        ("Ø Cash-on-Cash", _fmt_pct(m.get("avg_cash_on_cash", 0))),
        ("Min. DSCR", f"{m.get('min_dscr', 0):.2f}"),
        ("Terminal Value", _fmt_eur(dcf.get("terminal_value", 0))),
        ("Verkaufserlös", _fmt_eur(dcf.get("sale_proceeds", 0))),
        ("Gesamtrendite EK", _fmt_eur(dcf.get("total_equity_return", 0))),
    ]
    items.append(_kv_table(rows, styles))

    # Yearly table
    cfs = dcf.get("yearly_cashflows", [])
    if cfs:
        items.append(Spacer(1, 0.3*cm))
        hdr = ["Jahr", "NOI (€)", "Schuldend. (€)", "Cash Flow (€)", "NOI-Yield"]
        data = [hdr] + [
            [
                str(cf.get("year")),
                _fmt_eur(cf.get("noi", 0)),
                _fmt_eur(cf.get("debt_service", 0)),
                _fmt_eur(cf.get("cash_flow_before_tax", 0)),
                _fmt_pct(cf.get("noi_yield", 0)),
            ]
            for cf in cfs
        ]
        t = Table(data, colWidths=[1.5*cm, 4*cm, 4*cm, 4*cm, 3*cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
            ("FONT", (0, 1), (-1, -1), "Helvetica", 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E8E8ED")),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        items.append(t)
    return items


def _location_section(loc: dict, styles) -> list:
    items = _section_header(f"Standortanalyse – {loc.get('city', '')}", styles)
    macro = loc.get("macro", {})
    micro = loc.get("micro", {})
    rows = [
        ("Gesamt-Score", f"{loc.get('overall_score', 0):.0f}/100"),
        ("Städte-Tier", macro.get("city_tier", "–")),
        ("Stadtbewertung", f"{macro.get('city_rating', 0)}/10"),
        ("Infrastruktur", f"{macro.get('infrastructure_score', 0)}/10"),
        ("Bevölkerungstrend", macro.get("population_trend", "–")),
        ("Lage-Bewertung", f"{micro.get('neighborhood_rating', 0)}/10"),
        ("ÖPNV-Score", f"{micro.get('public_transport_score', 0)}/10"),
        ("Empfehlung", loc.get("recommendation", "–")),
    ]
    items.append(_kv_table(rows, styles))
    return items


def _risk_section(risk: dict, styles) -> list:
    items = _section_header("Portfolio Risiko Modell", styles)
    scores = risk.get("scores", {})
    rows = [
        ("Gesamt-Risikoscore", f"{risk.get('overall_risk_score', 0):.0f}/100 ({risk.get('risk_category', '–')})"),
        ("Marktrisiko", f"{scores.get('market_risk', 0):.0f}/100"),
        ("Mieterrisiko", f"{scores.get('tenant_risk', 0):.0f}/100"),
        ("Substanzrisiko", f"{scores.get('structural_risk', 0):.0f}/100"),
        ("Liquiditätsrisiko", f"{scores.get('liquidity_risk', 0):.0f}/100"),
        ("Finanzrisiko", f"{scores.get('financial_risk', 0):.0f}/100"),
        ("Regulatorisches Risiko", f"{scores.get('regulatory_risk', 0):.0f}/100"),
    ]
    items.append(_kv_table(rows, styles))

    recs = risk.get("recommendations", [])
    if recs:
        items.append(Spacer(1, 0.3*cm))
        h3 = _s("h3", styles, fontSize=10, textColor=DARK, fontName="Helvetica-Bold", spaceAfter=4)
        items.append(Paragraph("Empfehlungen:", h3))
        body = _s("body", styles, fontSize=9, textColor=GRAY, spaceAfter=2)
        for r in recs:
            items.append(Paragraph(f"• {r}", body))
    return items
