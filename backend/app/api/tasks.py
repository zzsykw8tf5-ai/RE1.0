"""Property task / measure management API."""
from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.property import (
    Property, PropertyTask, RentalArea, Tenant,
    TASK_CATEGORIES, TASK_STATUSES, TASK_PRIORITIES,
)

router = APIRouter(prefix="/api", tags=["tasks"])

# ── Task templates per category ───────────────────────────────────────────────

TASK_TEMPLATES: dict[str, list[dict]] = {
    "LEASING": [
        {"title": "Exposé erstellen", "priority": "HIGH"},
        {"title": "Besichtigungstermin vereinbaren", "priority": "HIGH"},
        {"title": "Mietangebot versenden", "priority": "MEDIUM"},
        {"title": "Bonitätsprüfung Mieter", "priority": "HIGH"},
        {"title": "Mietvertrag verhandeln", "priority": "HIGH"},
        {"title": "Mietvertrag unterzeichnen", "priority": "HIGH"},
        {"title": "Kaution vereinnahmen", "priority": "MEDIUM"},
        {"title": "Übergabeprotokoll erstellen", "priority": "HIGH"},
        {"title": "Schlüsselübergabe", "priority": "MEDIUM"},
    ],
    "SALES": [
        {"title": "Verkaufsexposé erstellen", "priority": "HIGH"},
        {"title": "Wertgutachten beauftragen", "priority": "HIGH"},
        {"title": "Käufersuche / Maklerauftrag", "priority": "HIGH"},
        {"title": "Käufer-Due-Diligence", "priority": "HIGH"},
        {"title": "Kaufpreisverhandlung", "priority": "HIGH"},
        {"title": "Notartermin vereinbaren", "priority": "HIGH"},
        {"title": "Kaufvertrag unterzeichnen", "priority": "CRITICAL"},
        {"title": "Eigentumsübergang / Auflassung", "priority": "HIGH"},
        {"title": "Kaufpreiszahlung bestätigen", "priority": "CRITICAL"},
    ],
    "CAPEX": [
        {"title": "Maßnahme definieren & Budget festlegen", "priority": "HIGH"},
        {"title": "Angebote einholen (min. 3)", "priority": "HIGH"},
        {"title": "Architekt / Planer beauftragen", "priority": "MEDIUM"},
        {"title": "Baugenehmigung beantragen", "priority": "HIGH"},
        {"title": "Auftrag vergeben", "priority": "HIGH"},
        {"title": "Baubegleitung / Kontrolle", "priority": "MEDIUM"},
        {"title": "Rechnungsprüfung", "priority": "MEDIUM"},
        {"title": "Abnahme & Mängelprotokoll", "priority": "HIGH"},
        {"title": "Aktivierung im Anlagevermögen", "priority": "MEDIUM"},
    ],
    "CONSTRUCTION": [
        {"title": "Bedarfsermittlung / Raumprogramm", "priority": "HIGH"},
        {"title": "Architekt beauftragen (HOAI)", "priority": "HIGH"},
        {"title": "Baugenehmigung einreichen", "priority": "CRITICAL"},
        {"title": "Ausschreibung erstellen", "priority": "HIGH"},
        {"title": "Generalunternehmer vergeben", "priority": "CRITICAL"},
        {"title": "Baubeginn / Spatenstich", "priority": "HIGH"},
        {"title": "Rohbauabnahme", "priority": "HIGH"},
        {"title": "Technischer Ausbau (HLSK)", "priority": "HIGH"},
        {"title": "Innenausbau / Fassade", "priority": "MEDIUM"},
        {"title": "Bauabnahme (§ 640 BGB)", "priority": "CRITICAL"},
        {"title": "Brandschutzabnahme", "priority": "CRITICAL"},
        {"title": "Betriebskostenoptimierung", "priority": "LOW"},
    ],
    "MAINTENANCE": [
        {"title": "Jahresinspektion Gebäudetechnik", "priority": "HIGH"},
        {"title": "Heizungsanlage warten", "priority": "HIGH"},
        {"title": "Aufzug prüfen (TÜV)", "priority": "CRITICAL"},
        {"title": "Dachinspektion", "priority": "MEDIUM"},
        {"title": "Fassadenprüfung", "priority": "LOW"},
        {"title": "Elektroanlagen-Prüfung (E-Check)", "priority": "HIGH"},
        {"title": "Brandschutzanlage prüfen", "priority": "CRITICAL"},
        {"title": "Winterdienst beauftragen", "priority": "MEDIUM"},
        {"title": "Nebenkostenabrechnung erstellen", "priority": "HIGH"},
    ],
    "LEGAL": [
        {"title": "Mietvertrag prüfen lassen", "priority": "MEDIUM"},
        {"title": "Versicherungsschutz prüfen", "priority": "HIGH"},
        {"title": "Behördenkorrespondenz", "priority": "MEDIUM"},
        {"title": "Mietrecht: Streitfall bearbeiten", "priority": "HIGH"},
        {"title": "Grundbuchauszug aktualisieren", "priority": "LOW"},
        {"title": "Teilungserklärung prüfen", "priority": "MEDIUM"},
    ],
    "MANAGEMENT": [
        {"title": "Eigentümerversammlung vorbereiten", "priority": "HIGH"},
        {"title": "Wirtschaftsplan erstellen", "priority": "HIGH"},
        {"title": "Hausverwaltungsvertrag prüfen", "priority": "MEDIUM"},
        {"title": "Reporting / Asset Management Bericht", "priority": "MEDIUM"},
        {"title": "Mieterhöhung prüfen", "priority": "MEDIUM"},
        {"title": "Dienstleistungsverträge optimieren", "priority": "LOW"},
    ],
}


def _task_dict(t: PropertyTask, db: Session | None = None) -> dict:
    area_name = None
    tenant_name = None
    if db:
        if t.area_id:
            area = db.query(RentalArea).filter_by(id=t.area_id).first()
            area_name = area.name if area else None
        if t.tenant_id:
            tenant = db.query(Tenant).filter_by(id=t.tenant_id).first()
            tenant_name = tenant.name if tenant else None
    return {
        "id": t.id,
        "property_id": t.property_id,
        "title": t.title,
        "description": t.description,
        "category": t.category,
        "category_label": TASK_CATEGORIES.get(t.category, t.category),
        "status": t.status,
        "status_label": TASK_STATUSES.get(t.status, t.status),
        "priority": t.priority,
        "priority_label": TASK_PRIORITIES.get(t.priority, t.priority),
        "cost_estimate": t.cost_estimate,
        "cost_actual": t.cost_actual,
        "due_date": str(t.due_date) if t.due_date else None,
        "assigned_to": t.assigned_to,
        "area_id": t.area_id,
        "area_name": area_name,
        "tenant_id": t.tenant_id,
        "tenant_name": tenant_name,
        "created_at": str(t.created_at) if t.created_at else None,
    }


# ── GET /api/properties/{id}/tasks ───────────────────────────────────────────

@router.get("/properties/{property_id}/tasks")
def list_tasks(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    tasks = db.query(PropertyTask).filter_by(property_id=property_id)\
              .order_by(PropertyTask.created_at.desc()).all()
    areas = db.query(RentalArea).filter_by(property_id=property_id).all()
    tenants = db.query(Tenant).filter_by(property_id=property_id).all()
    return {
        "tasks": [_task_dict(t, db) for t in tasks],
        "categories": [{"key": k, "label": v} for k, v in TASK_CATEGORIES.items()],
        "statuses": [{"key": k, "label": v} for k, v in TASK_STATUSES.items()],
        "priorities": [{"key": k, "label": v} for k, v in TASK_PRIORITIES.items()],
        "templates": TASK_TEMPLATES,
        "areas": [{"id": a.id, "name": a.name} for a in areas],
        "tenants": [{"id": t.id, "name": t.name} for t in tenants],
    }


# ── POST /api/properties/{id}/tasks ──────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    category: str = "OTHER"
    status: str = "TODO"
    priority: str = "MEDIUM"
    cost_estimate: float | None = None
    cost_actual: float | None = None
    due_date: str | None = None
    assigned_to: str | None = None
    area_id: int | None = None
    tenant_id: int | None = None


@router.post("/properties/{property_id}/tasks")
def create_task(property_id: int, data: TaskCreate, db: Session = Depends(get_db)):
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    due = None
    if data.due_date:
        try:
            due = date_type.fromisoformat(data.due_date)
        except ValueError:
            pass
    task = PropertyTask(
        property_id=property_id,
        title=data.title.strip(),
        description=data.description,
        category=data.category,
        status=data.status,
        priority=data.priority,
        cost_estimate=data.cost_estimate,
        cost_actual=data.cost_actual,
        due_date=due,
        assigned_to=data.assigned_to,
        area_id=data.area_id,
        tenant_id=data.tenant_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_dict(task, db)


# ── PATCH /api/properties/{id}/tasks/{task_id} ───────────────────────────────

class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    status: str | None = None
    priority: str | None = None
    cost_estimate: float | None = None
    cost_actual: float | None = None
    due_date: str | None = None
    assigned_to: str | None = None
    area_id: int | None = None
    tenant_id: int | None = None


@router.patch("/properties/{property_id}/tasks/{task_id}")
def update_task(property_id: int, task_id: int, data: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(PropertyTask).filter_by(id=task_id, property_id=property_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    raw = data.model_dump(exclude_unset=True)
    if "due_date" in raw:
        if raw["due_date"]:
            try:
                raw["due_date"] = date_type.fromisoformat(raw["due_date"])
            except ValueError:
                raw.pop("due_date")
        else:
            raw["due_date"] = None
    for k, v in raw.items():
        setattr(task, k, v)
    db.commit()
    db.refresh(task)
    return _task_dict(task, db)


# ── DELETE /api/properties/{id}/tasks/{task_id} ──────────────────────────────

@router.delete("/properties/{property_id}/tasks/{task_id}")
def delete_task(property_id: int, task_id: int, db: Session = Depends(get_db)):
    task = db.query(PropertyTask).filter_by(id=task_id, property_id=property_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"ok": True}
