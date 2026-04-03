"""RE Analyst Pro – FastAPI Backend."""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import engine, Base
from .api.upload import router as upload_router
from .api.analysis import router as analysis_router
from .api.reports import router as reports_router
from .api.market import router as market_router
from .api.news import router as news_router

# Create database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="RE Analyst Pro",
    description="Real Estate Analysis API – German & US Valuation, DCF, Location, Risk",
    version="1.0.0",
)

# CORS – erlaubt GitHub Pages + localhost
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://zzsykw8tf5-ai.github.io",  # GitHub Pages
]
# Zusätzliche Origins über Env-Variable (z.B. custom domain)
extra = os.environ.get("ALLOWED_ORIGINS", "")
if extra:
    ALLOWED_ORIGINS += [o.strip() for o in extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(upload_router)
app.include_router(analysis_router)
app.include_router(reports_router)
app.include_router(market_router)
app.include_router(news_router)

# Static files for uploads (lokal)
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "RE Analyst Pro"}
