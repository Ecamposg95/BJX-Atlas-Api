from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db


DEFAULT_TEST_ORG_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_TEST_BRANCH_ID = "00000000-0000-0000-0000-0000000000aa"


def _install_test_branch_default_listener():
    """Auto-fill branch_id en cualquier modelo con BranchScopedMixin si no se set explícito.

    Solo para tests legacy — en producción cada router debe asignar branch_id desde el
    TenantContext. Este listener evita reescribir 30+ fixtures.
    """
    from app.models.mixins import BranchScopedMixin

    def _set_default_branch(mapper, connection, target):
        if isinstance(target, BranchScopedMixin) and getattr(target, "branch_id", None) is None:
            target.branch_id = DEFAULT_TEST_BRANCH_ID

    # Subscribir a TODOS los mappers que hereden BranchScopedMixin
    from app.database import Base
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if issubclass(cls, BranchScopedMixin):
            try:
                event.listen(cls, "before_insert", _set_default_branch, propagate=True)
            except Exception:
                pass


_install_test_branch_default_listener()


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

    # Seed default org + branch para tests legacy
    from app.models.organizations import Organization, Branch
    org = Organization(id=DEFAULT_TEST_ORG_ID, code="BJX", name="BJX Motors", active=True)
    branch = Branch(
        id=DEFAULT_TEST_BRANCH_ID,
        organization_id=DEFAULT_TEST_ORG_ID,
        code="BJX-MAIN",
        name="BJX Motors — Main",
        timezone="America/Mexico_City",
        active=True,
    )
    session.add_all([org, branch])
    session.commit()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()


@pytest.fixture(scope="function")
def default_branch_id():
    return DEFAULT_TEST_BRANCH_ID


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
        role=Role.admin.value,
        default_branch_id=DEFAULT_TEST_BRANCH_ID,
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
        role=Role.operador.value,
        default_branch_id=DEFAULT_TEST_BRANCH_ID,
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
        role=Role.viewer.value,
        default_branch_id=DEFAULT_TEST_BRANCH_ID,
        active=True,
    )
    db.add(user)
    db.commit()
    r = client.post("/api/auth/login", json={"email": "viewer@test.com", "password": "Viewer1234"})
    return r.json()["access_token"]
