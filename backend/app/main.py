"""RE Analyst Pro – FastAPI Backend."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .database import engine, Base
from .api.upload import router as upload_router
from .api.analysis import router as analysis_router
from .api.reports import router as reports_router

# Create database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="RE Analyst Pro",
    description="Real Estate Analysis API – German & US Valuation, DCF, Location, Risk",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(upload_router)
app.include_router(analysis_router)
app.include_router(reports_router)

# Static files for uploads
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "RE Analyst Pro"}
