"""Property task / measure management API."""
from datetime import date as date_type
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.property import Property, PropertyTask, TASK_CATEGORIES, TASK_STATUSES, TASK_PRIORITIES

router = APIRouter(prefix="/api", tags=["tasks"])


def _task_dict(t: PropertyTask) -> dict:
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
        "created_at": str(t.created_at) if t.created_at else None,
    }


# ── GET /api/properties/{id}/tasks ────────────────────────────────────────────

@router.get("/properties/{property_id}/tasks")
def list_tasks(property_id: int, db: Session = Depends(get_db)):
    prop = db.query(Property).filter_by(id=property_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    tasks = db.query(PropertyTask).filter_by(property_id=property_id)\
              .order_by(PropertyTask.created_at.desc()).all()
    return {
        "tasks": [_task_dict(t) for t in tasks],
        "categories": [{"key": k, "label": v} for k, v in TASK_CATEGORIES.items()],
        "statuses": [{"key": k, "label": v} for k, v in TASK_STATUSES.items()],
        "priorities": [{"key": k, "label": v} for k, v in TASK_PRIORITIES.items()],
    }


# ── POST /api/properties/{id}/tasks ───────────────────────────────────────────

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
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_dict(task)


# ── PATCH /api/properties/{id}/tasks/{task_id} ────────────────────────────────

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
    return _task_dict(task)


# ── DELETE /api/properties/{id}/tasks/{task_id} ───────────────────────────────

@router.delete("/properties/{property_id}/tasks/{task_id}")
def delete_task(property_id: int, task_id: int, db: Session = Depends(get_db)):
    task = db.query(PropertyTask).filter_by(id=task_id, property_id=property_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"ok": True}
