# Credenciales de prueba — BJX Atlas

Usuarios demo sembrados por `scripts/seed_users.py`. Idempotente — re-ejecutable sin duplicar.

> **Solo para QA / piloto / desarrollo.** Cambiar todas las contraseñas antes de exponer a producción real.

## Endpoint de login

```
POST /api/v1/auth/login
Content-Type: application/x-www-form-urlencoded

username=<email>&password=<password>
```

Respuesta: `{ "access_token": "...", "token_type": "bearer" }`. Enviar como `Authorization: Bearer <token>` en requests subsiguientes.

## Usuarios

### Roles globales (sin sede asignada — ven todas)

| Email | Password | Rol | Descripción |
|---|---|---|---|
| `admin@bjx.com` | `Admin1234` | `admin` | Super admin del sistema |
| `director@bjx.com` | `Director1234` | `director` | Director corporativo (cross-sede) |
| `viewer@bjx.com` | `Viewer1234` | `viewer` | Viewer global (read-only) |
| `brame@bjx.com` | `Brame1234` | `cliente_corp` | Cliente corporativo BRAME |

### Roles branch-scoped — Sede LEÓN

| Email | Password | Rol | Sede |
|---|---|---|---|
| `gerente.leon@bjx.com` | `Gerente1234` | `gerente_sede` | LEON |
| `jefe.leon@bjx.com` | `Jefe1234` | `jefe_taller` | LEON |
| `recepcion.leon@bjx.com` | `Recepcion1234` | `recepcion` | LEON |
| `mecanico.leon@bjx.com` | `Mecanico1234` | `mecanico` | LEON |
| `almacen.leon@bjx.com` | `Almacen1234` | `almacen` | LEON |

### Legacy

| Email | Password | Rol | Descripción |
|---|---|---|---|
| `operador@bjx.com` | `Operador1234` | `operador` | Operador legacy (calculadora/cotizador) |

## Cómo regenerar

### Local

```bash
DATABASE_URL=sqlite:///./bjx_dev.db python scripts/seed_users.py
```

### Railway (producción)

Auto-seedeado en cada deploy vía `railway_init.py`. Para forzar sin redeploy:

```bash
# Vía endpoint admin (requiere token admin):
curl -X POST https://<railway-domain>/api/admin/seed/users \
  -H "Authorization: Bearer <admin-token>"
```

## IDs de Sedes

| Código | UUID |
|---|---|
| MAIN | `00000000-0000-0000-0000-0000000000aa` |
| LEON | `00000000-0000-0000-0000-0000000000ab` |
| QRO  | `00000000-0000-0000-0000-0000000000ac` |
| GDL  | `00000000-0000-0000-0000-0000000000ad` |
| CDMX | `00000000-0000-0000-0000-0000000000ae` |
| MTY  | `00000000-0000-0000-0000-0000000000af` |
| PUE  | `00000000-0000-0000-0000-0000000000b0` |
| TIJ  | `00000000-0000-0000-0000-0000000000b1` |
| SLP  | `00000000-0000-0000-0000-0000000000b2` |
| AGS  | `00000000-0000-0000-0000-0000000000b3` |

Definidas en migración `c4f1a8b3d502_multitenancy_foundation_and_erp.py`.
