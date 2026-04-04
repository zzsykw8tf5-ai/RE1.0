import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Railway setzt DATABASE_URL für PostgreSQL, sonst SQLite lokal
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Railway liefert postgres:// aber SQLAlchemy braucht postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite: auf Railway persistentes Volume nutzen, lokal ./realestate.db
if not DATABASE_URL:
    if os.environ.get("RAILWAY_ENVIRONMENT"):
        # Persistentes Volume – muss in Railway unter /app/data gemountet sein
        data_dir = "/app/data"
        os.makedirs(data_dir, exist_ok=True)
        DATABASE_URL = f"sqlite:///{data_dir}/realestate.db"
    else:
        DATABASE_URL = "sqlite:///./realestate.db"

IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
