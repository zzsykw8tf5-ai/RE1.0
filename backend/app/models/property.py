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

    tenants = relationship("Tenant", back_populates="property", cascade="all, delete-orphan")
    scenarios = relationship("Scenario", back_populates="property", cascade="all, delete-orphan")


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
