import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

# Load environment configuration
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

# Determine database path
SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH")
if not SQLITE_DB_PATH:
    # Fallback to local storage folder inside the monorepo structure
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    SQLITE_DB_PATH = os.path.join(base_dir, "storage", "renderpilot.db")

# Create SQLite database connection string
# check_same_thread=False is required for SQLite inside concurrent thread executors
DATABASE_URL = f"sqlite:///{SQLITE_DB_PATH}"

engine = create_engine(
    DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to yield database sessions to API routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
