# BJX Atlas — Stack y Patrones

> Patrones de codigo actualmente usados en BJX-Atlas-Api. Para producto y reglas de negocio, ver `PRODUCT.md`.

---

## 1. Stack

### Backend

| Componente | Tecnologia | Version |
|---|---|---|
| Lenguaje | Python | 3.12 |
| Framework | FastAPI | 0.127.0 |
| ASGI dev | Uvicorn | 0.40.0 |
| ASGI prod | Gunicorn + Uvicorn worker | latest |
| ORM | SQLAlchemy | 2.0.45 |
| DB driver | psycopg2-binary | latest |
| DB prod | PostgreSQL | — |
| DB local/test | SQLite | built-in |
| Migrations | Alembic | latest |
| Validacion | Pydantic | 2.12.5 |
| JWT | python-jose | 3.5.0 |
| Hashing | passlib + bcrypt | 1.7.4 / 3.2.0 |
| Config | python-dotenv | 1.2.1 |
| PDF | reportlab | 4.4.7 |
| Storage | Cloudflare R2 (S3-compatible, boto3) | — |
| Deploy | Railway + nixpacks | — |

### Frontend

| Componente | Tecnologia | Version |
|---|---|---|
| Build | Vite | 8.x |
| Lenguaje | TypeScript | 6.x |
| UI | React | 19.x |
| Routing | react-router-dom | 7.x |
| Estado server | @tanstack/react-query | 5.x |
| Estado cliente | zustand | 5.x |
| Forms | react-hook-form + @hookform/resolvers | 7.x |
| Validacion | zod | 3.x |
| Estilos | Tailwind CSS v4 (CSS-first via `@import "tailwindcss"`) | 4.x |
| Tokens | `frontend/src/design-system/tokens.ts` | — |
| Iconos | lucide-react | — |
| Charts | recharts | 3.x |
| HTTP | axios | 1.x |

---

## 2. Estructura de carpetas

```
project_root/
├── app/
│   ├── main.py              # FastAPI app: init, middleware, routers
│   ├── database.py          # Engine, SessionLocal, Base, get_db()
│   ├── models/              # SQLAlchemy ORM
│   │   ├── __init__.py
│   │   └── mixins.py        # UUIDMixin, AuditMixin
│   ├── routers/             # Un archivo por dominio
│   ├── schemas/             # Pydantic v2 request/response
│   ├── security/            # JWT, get_current_user, permission matrix
│   ├── services/            # Logica de negocio desacoplada
│   └── utils/               # PDF, exportacion
├── scripts/
│   ├── init_db.py
│   ├── seed_data.py         # Carga Excel → BD
│   └── railway_init.py
├── tests/
├── frontend/
│   ├── src/
│   │   ├── api/             # Axios client + types
│   │   ├── components/      # UI components
│   │   ├── design-system/   # Tokens + cn helper
│   │   ├── pages/           # Routes
│   │   ├── store/           # zustand stores (auth, theme)
│   │   └── index.css        # Tailwind + theme tokens
│   ├── tailwind.config.* (no aplica — Tailwind v4 CSS-first)
│   └── vite.config.ts
├── context/
│   ├── PRODUCT.md           # Maestro de producto
│   ├── STACK.md             # Este archivo
│   └── BJX_Calculadora_Brame_v1.xlsx
└── CLAUDE.md
```

---

## 3. Database (`app/database.py`)

```python
import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")

# Railway/Heroku usan postgres:// — SQLAlchemy requiere postgresql://
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if "sqlite" in SQLALCHEMY_DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

# autoflush=False es CRITICO. Reglas de negocio reordenan flushes.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## 4. Mixins de modelos (`app/models/mixins.py`)

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import declarative_mixin

@declarative_mixin
class UUIDMixin:
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

@declarative_mixin
class AuditMixin:
    created_at = Column(DateTime(timezone=True),
                        default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True),
                        onupdate=lambda: datetime.now(timezone.utc), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
```

Uso:
```python
from app.database import Base
from app.models.mixins import UUIDMixin, AuditMixin

class WorkOrder(Base, UUIDMixin, AuditMixin):
    __tablename__ = "work_orders"
    branch_id = Column(String(36), ForeignKey("branches.id"), nullable=False, index=True)
    order_number = Column(String, nullable=False, index=True)
    # id, created_at, updated_at, deleted_at heredados
```

---

## 5. Autenticacion JWT (`app/security/__init__.py`)

```python
import os
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.users import User

SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 12

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def verify_password(plain, hashed): return pwd_context.verify(plain, hashed)
def hash_password(p): return pwd_context.hash(p)

def create_access_token(data: dict, expires_delta=None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales no validas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        cookie = request.cookies.get("access_token", "")
        token = cookie.replace("Bearer ", "") if cookie.startswith("Bearer ") else cookie
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.email == username, User.active == True).first()
    if not user:
        raise credentials_exception
    request.state.role = payload.get("role")
    return user
```

---

## 6. Patron de Router

```python
# app/routers/work_orders.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.security import get_current_user
from app.security.tenant import branch_scoped_query, TenantContext, get_tenant_ctx
from app.security.permissions import require_permission, Permission
from app.models.users import User
from app.models.work_orders import WorkOrder
from app.schemas.work_orders import WorkOrderRead, WorkOrderCreate

router = APIRouter()

@router.get("", response_model=list[WorkOrderRead])
def list_work_orders(
    skip: int = 0,
    size: int = 50,                          # NB: usa "size", no "page_size"
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    ctx: TenantContext = Depends(get_tenant_ctx),
):
    q = branch_scoped_query(db.query(WorkOrder), ctx, WorkOrder)
    return q.offset(skip).limit(size).all()

@router.post("", response_model=WorkOrderRead, status_code=201,
             dependencies=[Depends(require_permission(Permission.WORK_ORDER_CREATE))])
def create_work_order(
    payload: WorkOrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    ctx: TenantContext = Depends(get_tenant_ctx),
):
    wo = WorkOrder(**payload.model_dump(), branch_id=ctx.branch_id)
    db.add(wo)
    db.commit()
    db.refresh(wo)
    return wo
```

Registro en `app/main.py`:
```python
from app.routers import work_orders, auth
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(work_orders.router, prefix="/api/v1/work-orders", tags=["Work Orders"])
```

---

## 7. Pydantic v2 schemas

```python
# app/schemas/work_orders.py
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

class WorkOrderCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    type: str = Field(..., pattern="^(appointment|walk_in|tow|standby|warranty|internal)$")
    vehicle_id: str
    priority: int = Field(default=3, ge=1, le=5)
    notes: str | None = None

class WorkOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    order_number: str
    status: str
    type: str
    branch_id: str
    created_at: datetime
```

---

## 8. Frontend — Patrones

### API client (axios)

```ts
// frontend/src/api/client.ts
import axios from 'axios'
import { useAuthStore } from '../store/auth'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  const branchId = useAuthStore.getState().currentBranchId
  if (branchId) config.headers['X-Branch-Id'] = branchId
  return config
})
```

### React Query hooks

```ts
// frontend/src/api/work-orders.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export function useWorkOrders(params: { size?: number } = {}) {
  return useQuery({
    queryKey: ['work-orders', params],
    queryFn: async () => {
      const { data } = await api.get('/v1/work-orders', { params })
      // DEFENSIVE: SPA fallback puede devolver HTML — Array.isArray protege
      return Array.isArray(data) ? data : []
    },
  })
}

export function useCreateWorkOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: WorkOrderCreate) => api.post('/v1/work-orders', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-orders'] }),
  })
}
```

### Forms con RHF + Zod

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  type: z.enum(['appointment', 'walk_in', 'tow', 'standby', 'warranty', 'internal']),
  vehicle_id: z.string().uuid(),
  priority: z.number().int().min(1).max(5).default(3),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export function NewWorkOrderForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })
  const { mutate, isPending } = useCreateWorkOrder()
  return (
    <form onSubmit={handleSubmit((data) => mutate(data))}>
      {/* ... */}
    </form>
  )
}
```

### Tailwind tokens (v4 CSS-first)

Configuracion vive en `frontend/src/index.css` con `@theme` y CSS variables. No hay `tailwind.config.js`.

```css
@import "tailwindcss";

@theme {
  --color-brand-yellow: #FBBF24;
  --color-brand-navy: #1E293B;
  --color-brand-red: #DC2626;
  --color-semaphore-green: #10b981;
  --color-semaphore-amber: #f59e0b;
  --color-semaphore-red: #ef4444;
}

:root {
  --color-text: #1f2933;
  --color-surface: #fffdf8;
  /* ... */
}
```

Constantes TypeScript en `frontend/src/design-system/tokens.ts` para uso programatico (inline styles, recharts, etc.).

---

## 9. Multi-tenancy

### Regla fundamental

**Toda query filtra por `branch_id` via `branch_scoped_query()`**. Nunca devolver datos de otra sucursal a un rol BRANCH.

```python
# Correcto
q = branch_scoped_query(db.query(WorkOrder), ctx, WorkOrder)

# Incorrecto — fuga de datos cross-tenant
db.query(WorkOrder).all()
```

### TenantContext

```python
# app/security/tenant.py
@dataclass
class TenantContext:
    user: User
    branch_id: str | None       # None solo para roles GLOBAL sin header
    is_global: bool

def get_tenant_ctx(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantContext:
    header_branch = request.headers.get("X-Branch-Id")
    if user.role in BRANCH_SCOPED_ROLES:
        # branch obligatorio = default_branch_id, header debe coincidir
        if header_branch and header_branch != user.default_branch_id:
            raise HTTPException(403, "FORBIDDEN_BRANCH_SCOPE")
        return TenantContext(user=user, branch_id=user.default_branch_id, is_global=False)
    return TenantContext(user=user, branch_id=header_branch, is_global=True)
```

---

## 10. Variables de entorno

### `.env.example`

```
DATABASE_URL=postgresql://user:password@localhost:5432/bjx
SECRET_KEY=change_me_in_production
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=bjx-atlas-prod
INIT_USERS_ON_BOOT=false
```

### `.env` (local)

```
DATABASE_URL=sqlite:///./bjx_dev.db
SECRET_KEY=dev_secret_local
INIT_USERS_ON_BOOT=true
```

---

## 11. Despliegue Railway

### `Procfile`

```
web: python scripts/railway_init.py && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### `nixpacks.toml`

```toml
[phases.setup]
nixpkgs = ["python312", "postgresql"]

[phases.install]
cmds = ["pip install -r requirements.txt"]
```

### Flujo

```
develop → PR → main → Railway auto-deploy
```

Nunca pushear directamente a `main`. Trabajo en `develop`.

---

## 12. Comandos cheatsheet

```bash
# Setup
/usr/bin/python3.12 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# DB
DATABASE_URL=sqlite:///./bjx_dev.db alembic upgrade head
DATABASE_URL=sqlite:///./bjx_dev.db python seeds/load_data.py
alembic revision --autogenerate -m "descripcion"

# Run
DATABASE_URL=sqlite:///./bjx_dev.db uvicorn app.main:app --reload

# Test
pytest
pytest tests/test_pricing_engine.py -v

# Frontend
cd frontend && npm install
npm run dev          # vite dev server
npm run build        # tsc + vite build
npm run lint
```

---

## 13. Gotchas

- `autoflush=False` es obligatorio. Reglas de negocio reordenan flushes; activarlo rompe la state machine.
- `/work-orders` ≠ `/workshop` en URLs frontend. `/workshop` es la home del jefe_taller; `/workshop/board` es el kanban.
- Listados usan `size`, no `page_size`. Mantener convencion.
- SPA fallback: el servidor sirve `index.html` para rutas desconocidas con HTTP 200. Todo fetch que espera JSON debe defenderse con `Array.isArray()` o try/catch al parsear.
- Tailwind v4 no usa `tailwind.config.js`. La configuracion va en `index.css` con `@theme`.
- Pydantic v2: `model_config = ConfigDict(from_attributes=True)` (antes `orm_mode = True`).
