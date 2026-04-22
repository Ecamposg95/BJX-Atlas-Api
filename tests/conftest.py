from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db


@pytest.fixture(scope="function")
def db(tmp_path):
    db_path = Path(tmp_path) / "test.db"
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    Base.metadata.create_all(bind=test_engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()


@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# User helper fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_user(db):
    from app.models.users import User, Role
    from app.security import hash_password
    user = User(
        email="admin@test.com",
        hashed_password=hash_password("Admin1234"),
        role=Role.admin,
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def admin_token(client, admin_user):
    r = client.post("/api/auth/login", json={"email": "admin@test.com", "password": "Admin1234"})
    return r.json()["access_token"]


@pytest.fixture
def operador_token(client, db):
    from app.models.users import User, Role
    from app.security import hash_password
    user = User(
        email="op@test.com",
        hashed_password=hash_password("Operador1234"),
        role=Role.operador,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "op@test.com", "password": "Operador1234"})
    return r.json()["access_token"]


@pytest.fixture
def viewer_token(client, db):
    from app.models.users import User, Role
    from app.security import hash_password
    user = User(
        email="viewer@test.com",
        hashed_password=hash_password("Viewer1234"),
        role=Role.viewer,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "viewer@test.com", "password": "Viewer1234"})
    return r.json()["access_token"]
