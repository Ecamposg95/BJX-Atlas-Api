import os
import time
import logging
from sqlalchemy import create_engine, event, text, pool
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import OperationalError, SQLAlchemyError
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("bjx-atlas.database")
slow_query_logger = logging.getLogger("bjx-atlas.slow_query")

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./bjx_dev.db")

# Railway/Heroku usan postgres:// — SQLAlchemy requiere postgresql://
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = "sqlite" in SQLALCHEMY_DATABASE_URL

connect_args: dict = {}
if _is_sqlite:
    connect_args["check_same_thread"] = False
else:
    # Hard timeout so a hung Postgres connection doesn't block a worker forever
    connect_args["connect_timeout"] = int(os.getenv("DB_CONNECT_TIMEOUT", "10"))

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,          # validate connections before handing them out
    pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
    pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "30")),
    pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "1800")),  # recycle every 30 min
    echo=False,
) if not _is_sqlite else create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)


# ── SQLite pragmas ───────────────────────────────────────────────────────────

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if _is_sqlite:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


# ── Slow-query detection ─────────────────────────────────────────────────────

_SLOW_QUERY_THRESHOLD_S = float(os.getenv("SLOW_QUERY_THRESHOLD_S", "1.0"))


@event.listens_for(engine, "before_cursor_execute")
def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault("query_start_time", []).append(time.perf_counter())


@event.listens_for(engine, "after_cursor_execute")
def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    elapsed = time.perf_counter() - conn.info["query_start_time"].pop()
    if elapsed >= _SLOW_QUERY_THRESHOLD_S:
        slow_query_logger.warning(
            "Slow query detected",
            extra={
                "elapsed_s": round(elapsed, 3),
                "statement": statement[:500],  # truncate very long queries
            },
        )


# ── Connection-checkout logging ──────────────────────────────────────────────

@event.listens_for(engine, "checkout")
def _on_checkout(dbapi_conn, connection_record, connection_proxy):
    pool_status = engine.pool.status()
    logger.debug("DB connection checked out", extra={"pool_status": pool_status})


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """
    FastAPI dependency that yields a SQLAlchemy session.

    Errors opening the session are caught, logged with full context, and
    re-raised so FastAPI's exception handlers can return a proper 500.
    """
    try:
        db = SessionLocal()
    except SQLAlchemyError as exc:
        logger.error(
            "Failed to open database session",
            exc_info=True,
            extra={"error": str(exc)},
        )
        raise

    try:
        yield db
    except SQLAlchemyError as exc:
        logger.error(
            "Database error during request — rolling back",
            exc_info=True,
            extra={"error": str(exc)},
        )
        db.rollback()
        raise
    finally:
        db.close()


# ── Health / retry helpers ───────────────────────────────────────────────────

def check_db_connection() -> bool:
    """Return True if the database is reachable, False otherwise."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.error(
            "Database health check failed",
            exc_info=True,
            extra={"error": str(exc)},
        )
        return False


def wait_for_db(
    retries: int = 5,
    base_delay_s: float = 1.0,
    backoff_factor: float = 2.0,
) -> bool:
    """
    Block until the database is reachable or retries are exhausted.

    Uses exponential back-off: 1 s, 2 s, 4 s, 8 s, 16 s (default).
    Returns True on success, False if all attempts fail.
    """
    delay = base_delay_s
    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info(
                "Database connection established",
                extra={"attempt": attempt},
            )
            return True
        except OperationalError as exc:
            logger.warning(
                "Database not ready — retrying",
                extra={
                    "attempt": attempt,
                    "retries": retries,
                    "retry_in_s": delay,
                    "error": str(exc),
                },
            )
            if attempt < retries:
                time.sleep(delay)
                delay *= backoff_factor

    logger.error(
        "Database unreachable after all retries",
        extra={"retries": retries},
    )
    return False


def log_pool_status() -> dict:
    """Return and log the current connection pool status."""
    status = {
        "pool_size": engine.pool.size(),
        "checked_in": engine.pool.checkedin(),
        "checked_out": engine.pool.checkedout(),
        "overflow": engine.pool.overflow(),
        "invalid": engine.pool.invalid(),
    }
    logger.info("Connection pool status", extra=status)
    return status
