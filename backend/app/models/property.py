from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class PropertyType(str, enum.Enum):
    RESIDENTIAL = "RESIDENTIAL"
    OFFICE = "OFFICE"
    RETAIL = "RETAIL"
    INDUSTRIAL = "INDUSTRIAL"
    MIXED = "MIXED"


class TenantType(str, enum.Enum):
    ANCHOR = "ANCHOR"
    STANDARD = "STANDARD"
    SMALL = "SMALL"


class Creditworthiness(str, enum.Enum):
    A = "A"
    B = "B"
    C = "C"


class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    address = Column(String(500))
    city = Column(String(100))
    zip_code = Column(String(20))
    property_type = Column(
        Enum("RESIDENTIAL", "OFFICE", "RETAIL", "INDUSTRIAL", "MIXED", name="property_type_enum"),
        default="RESIDENTIAL"
    )
    construction_year = Column(Integer)
    total_area_sqm = Column(Float)
    land_area_sqm = Column(Float)
    floors = Column(Integer)
    units = Column(Integer)
    purchase_price = Column(Float)
    purchase_date = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    photo_url = Column(String, nullable=True)

    tenants = relationship("Tenant", back_populates="property", cascade="all, delete-orphan")
    scenarios = relationship("Scenario", back_populates="property", cascade="all, delete-orphan")
    areas = relationship("RentalArea", back_populates="property", cascade="all, delete-orphan")


class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    name = Column(String(255), nullable=False)
    unit = Column(String(100))
    area_sqm = Column(Float)
    monthly_rent = Column(Float)
    annual_rent = Column(Float)
    lease_start = Column(Date)
    lease_end = Column(Date)
    tenant_type = Column(
        Enum("ANCHOR", "STANDARD", "SMALL", name="tenant_type_enum"),
        default="STANDARD"
    )
    creditworthiness = Column(
        Enum("A", "B", "C", name="creditworthiness_enum"),
        default="B"
    )

    property = relationship("Property", back_populates="tenants")


class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    params_json = Column(Text)
    results_json = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    property = relationship("Property", back_populates="scenarios")


# ── gif-konforme Flächenverwaltung ─────────────────────────────────────────────

# gif MF/G 2017 Nutzungsarten + WoFlV Wohnfläche
GIF_NUTZUNGSARTEN = {
    "BUERO":        "Bürofläche",
    "EINZELHANDEL": "Einzelhandelsfläche",
    "LAGER":        "Lagerfläche",
    "PRODUKTION":   "Produktionsfläche",
    "GASTRONOMIE":  "Gastronomiefläche",
    "PRAXIS":       "Praxis-/Medizinfläche",
    "WOHNEN":       "Wohnfläche",
    "HOTEL":        "Hotelfläche",
    # Gesundheit & Pflege
    "PFLEGEHEIM":   "Pflegeheim",
    "ALTENHEIM":    "Alten-/Seniorenheim",
    "KRANKENHAUS":  "Krankenhaus / Klinik",
    "AERZTEHAUS":   "Ärztehaus",
    "MVZ":          "Medizinisches Versorgungszentrum (MVZ)",
    "SONSTIGES":    "Sonstige Fläche",
}

# Healthcare Nutzungsarten (needs beds field)
HEALTHCARE_NUTZUNGSARTEN = {"PFLEGEHEIM", "ALTENHEIM", "KRANKENHAUS", "AERZTEHAUS", "MVZ"}

ETAGEN = {
    "UG":  "Untergeschoss",
    "EG":  "Erdgeschoss",
    "OG1": "1. Obergeschoss",
    "OG2": "2. Obergeschoss",
    "OG3": "3. Obergeschoss",
    "OG4": "4. Obergeschoss",
    "OG5": "5. Obergeschoss",
    "DG":  "Dachgeschoss",
}

LAGE_QUALITAETEN = {
    "1A":    "1A-Lage",
    "1B":    "1B-Lage",
    "NEBEN": "Nebenlage",
}

AREA_STATUS = {
    "VERFUEGBAR":   "Verfügbar",
    "VERMIETET":    "Vermietet",
    "EIGENGENUTZT": "Eigengenutzt",
    "LEERSTAND":    "Leerstand",
}


class RentalArea(Base):
    """
    Einzelne Mietfläche (Flächeneinheit) innerhalb einer Immobilie.
    Nutzungsart nach gif MF/G 2017 / WoFlV.
    """
    __tablename__ = "rental_areas"

    id = Column(Integer, primary_key=True, index=True)
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=False)

    # gif-Klassifikation
    nutzungsart = Column(String(50), nullable=False, default="BUERO")   # key from GIF_NUTZUNGSARTEN
    etage = Column(String(10), default="EG")                             # key from ETAGEN
    lage_qualitaet = Column(String(10))                                  # key from LAGE_QUALITAETEN (Einzelhandel)

    # Flächenangaben
    name = Column(String(255), nullable=False)        # auto-generated designation, editable
    area_sqm = Column(Float)                          # Mietfläche in m²

    # Marktmiete
    market_rent_sqm = Column(Float)                   # €/m²/Monat (Richtwert)

    # Status
    status = Column(String(20), default="VERFUEGBAR") # key from AREA_STATUS

    # Healthcare specific
    beds = Column(Integer, nullable=True)  # Anzahl der Betten (Pflegeheim, Krankenhaus, etc.)

    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    property = relationship("Property", back_populates="areas")
