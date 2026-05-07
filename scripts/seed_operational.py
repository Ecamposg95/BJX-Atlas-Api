"""Seed operational data: warehouses, parts catalog, vehicles y work orders por sede.

Crea volúmenes diferenciados por sucursal para que cambiar de sede sea visible:
- LEÓN: 2 almacenes, 12 partes, 8 vehículos, 6 work orders activas
- QRO:  1 almacén,  10 partes, 5 vehículos, 4 work orders activas
- GDL:  1 almacén,   8 partes, 3 vehículos, 2 work orders activas
- MAIN: 1 almacén central, partes premium, 2 vehículos demo

Idempotente — usa códigos/SKU/placas únicos para detectar duplicados.

Uso:
    DATABASE_URL=sqlite:///./bjx_dev.db python scripts/seed_operational.py
"""
from __future__ import annotations

import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.catalog import Service, VehicleModel  # noqa: E402
from app.models.inventory import (  # noqa: E402
    InventoryMovement,
    InventoryMovementType,
    InventoryRequest,
    InventoryRequestStatus,
    Part,
    StockLevel,
    Warehouse,
)
from app.models.organizations import Branch  # noqa: E402
from app.models.users import User  # noqa: E402
from app.models.vehicles import Vehicle  # noqa: E402
from app.models.work_orders import WorkOrder, WorkOrderStatus  # noqa: E402

random.seed(42)  # determinístico

BRANCH_IDS = {
    "MAIN": "00000000-0000-0000-0000-0000000000aa",
    "LEON": "00000000-0000-0000-0000-0000000000ab",
    "QRO":  "00000000-0000-0000-0000-0000000000ac",
    "GDL":  "00000000-0000-0000-0000-0000000000ad",
}


PARTS_CATALOG = [
    # SKU, name, category, unit, min_stock, lead, cost
    ("FLT-OIL-001",  "Filtro de aceite estándar",       "filtros",     "pza", 5,  2,  120.00),
    ("FLT-AIR-002",  "Filtro de aire motor",            "filtros",     "pza", 3,  3,  180.00),
    ("FLT-FUEL-003", "Filtro de gasolina",              "filtros",     "pza", 4,  3,  240.00),
    ("OIL-5W30-001", "Aceite sintético 5W30 (1L)",      "lubricantes", "L",   12, 5,  220.00),
    ("OIL-10W40-002","Aceite mineral 10W40 (1L)",       "lubricantes", "L",   8,  5,  150.00),
    ("BRK-PAD-001",  "Balatas delanteras (juego)",      "frenos",      "set", 2,  4,  680.00),
    ("BRK-PAD-002",  "Balatas traseras (juego)",        "frenos",      "set", 2,  4,  580.00),
    ("BRK-DSC-001",  "Disco de freno delantero",        "frenos",      "pza", 1,  6,  920.00),
    ("BAT-12V-001",  "Batería 12V 60Ah",                "electrico",   "pza", 1,  7,  1850.00),
    ("BUJ-IRD-001",  "Bujía iridio (juego 4)",          "ignicion",    "set", 2,  5,  1280.00),
    ("CRR-AUX-001",  "Banda accesorios poly-V",         "transmision", "pza", 1,  6,  450.00),
    ("AMG-DEL-001",  "Amortiguador delantero",          "suspension",  "pza", 1,  10, 1650.00),
    ("AMG-TRA-002",  "Amortiguador trasero",            "suspension",  "pza", 1,  10, 1480.00),
    ("LIQ-FRN-001",  "Líquido de frenos DOT4 (500ml)",  "lubricantes", "ml",  4,  3,  180.00),
    ("LIQ-DIR-002",  "Aceite dirección hidráulica",     "lubricantes", "L",   3,  4,  220.00),
]

WAREHOUSE_PLAN = {
    "LEON": [("A1", "Almacén central León", "main"),
             ("A2", "Almacén satélite León", "satellite")],
    "QRO":  [("Q1", "Almacén central Querétaro", "main")],
    "GDL":  [("G1", "Almacén central Guadalajara", "main")],
    "MAIN": [("M1", "Almacén corporativo BJX", "main")],
}

# Cuántas partes y stock va cada almacén
STOCK_PROFILE = {
    "LEON": (12, "high"),   # alto volumen
    "QRO":  (10, "medium"),
    "GDL":  (8,  "medium"),
    "MAIN": (15, "premium"),
}

VEHICLES_PER_BRANCH = {
    "LEON": [
        ("Ana Rodríguez",   "5512345678", "Nissan",    "Versa",     2021, "GLZ-1234", "1HGBH41JXMN100001", 45000),
        ("Carlos Méndez",   "5523456789", "Chevrolet", "Aveo",      2019, "MEX-5678", "1HGBH41JXMN100002", 78000),
        ("María López",     "5534567890", "Ford",      "Fiesta",    2020, "JAL-9012", "1HGBH41JXMN100003", 52000),
        ("Luis Hernández",  "5545678901", "Nissan",    "March",     2022, "QRO-3456", "1HGBH41JXMN100004", 28000),
        ("Patricia Soto",   "5556789012", "Volkswagen","Vento",     2018, "GTO-7890", "1HGBH41JXMN100005", 95000),
        ("Roberto García",  "5567890123", "Toyota",    "Yaris",     2021, "AGS-1122", "1HGBH41JXMN100006", 38000),
        ("Diana Pérez",     "5578901234", "Honda",     "City",      2020, "SLP-3344", "1HGBH41JXMN100007", 62000),
        ("Fernando Ruiz",   "5589012345", "Mazda",     "3",         2019, "BCN-5566", "1HGBH41JXMN100008", 81000),
    ],
    "QRO": [
        ("Sandra Torres",   "4421234567", "Nissan",    "Sentra",    2020, "QRO-7788", "1HGBH41JXMN200001", 49000),
        ("Miguel Castro",   "4432345678", "Chevrolet", "Spark",     2021, "QRO-9900", "1HGBH41JXMN200002", 33000),
        ("Laura Vázquez",   "4443456789", "Ford",      "Figo",      2018, "QRO-1010", "1HGBH41JXMN200003", 88000),
        ("Eduardo Romero",  "4454567890", "Hyundai",   "Grand i10", 2022, "QRO-1212", "1HGBH41JXMN200004", 22000),
        ("Mónica Ramírez",  "4465678901", "Kia",       "Rio",       2019, "QRO-1414", "1HGBH41JXMN200005", 71000),
    ],
    "GDL": [
        ("Jorge Aguilar",   "3312345678", "Nissan",    "Versa",     2020, "JAL-2233", "1HGBH41JXMN300001", 56000),
        ("Cristina Núñez",  "3323456789", "Volkswagen","Polo",      2021, "JAL-4455", "1HGBH41JXMN300002", 41000),
        ("Andrés Cano",     "3334567890", "Toyota",    "Corolla",   2019, "JAL-6677", "1HGBH41JXMN300003", 92000),
    ],
    "MAIN": [
        ("Cliente Demo 1", "5500000001", "Nissan", "Sentra", 2022, "DEMO-001", "1HGBH41JXMN900001", 15000),
        ("Cliente Demo 2", "5500000002", "Honda", "Civic",   2021, "DEMO-002", "1HGBH41JXMN900002", 25000),
    ],
}


def _ensure_parts(db) -> dict[str, Part]:
    parts_by_sku: dict[str, Part] = {}
    for sku, name, cat, unit, min_st, lead, cost in PARTS_CATALOG:
        existing = db.query(Part).filter(Part.sku == sku).first()
        if existing:
            parts_by_sku[sku] = existing
            continue
        p = Part(
            sku=sku, name=name, category=cat, unit=unit,
            min_stock=min_st, lead_time_days=lead, last_unit_cost=cost,
            active=True,
        )
        db.add(p)
        db.flush()
        parts_by_sku[sku] = p
    return parts_by_sku


def _ensure_warehouses(db) -> dict[str, list[Warehouse]]:
    out: dict[str, list[Warehouse]] = {}
    for branch_key, plan in WAREHOUSE_PLAN.items():
        branch_id = BRANCH_IDS[branch_key]
        wh_list: list[Warehouse] = []
        for code, name, kind in plan:
            existing = (
                db.query(Warehouse)
                .filter(Warehouse.branch_id == branch_id, Warehouse.code == code)
                .first()
            )
            if existing:
                wh_list.append(existing)
                continue
            wh = Warehouse(branch_id=branch_id, code=code, name=name, kind=kind, active=True)
            db.add(wh)
            db.flush()
            wh_list.append(wh)
        out[branch_key] = wh_list
    return out


def _ensure_stock(db, warehouses: dict[str, list[Warehouse]], parts: dict[str, Part]) -> int:
    """Distribuye stock por sede. Volúmenes diferenciados."""
    movements = 0
    profile_qty = {"high": (15, 60), "medium": (8, 35), "premium": (20, 80)}
    sku_list = list(parts.keys())

    for branch_key, wh_list in warehouses.items():
        n_parts, profile = STOCK_PROFILE[branch_key]
        chosen_skus = sku_list[:n_parts]
        qty_min, qty_max = profile_qty[profile]
        wh_main = wh_list[0]

        for sku in chosen_skus:
            part = parts[sku]
            existing = (
                db.query(StockLevel)
                .filter(
                    StockLevel.warehouse_id == wh_main.id,
                    StockLevel.part_id == part.id,
                )
                .first()
            )
            if existing:
                continue

            qty = random.randint(qty_min, qty_max)
            # Algunas partes en bajo stock para que dispare alertas
            if random.random() < 0.18:
                qty = max(0, int(part.min_stock * 0.5))

            sl = StockLevel(
                branch_id=BRANCH_IDS[branch_key],
                warehouse_id=wh_main.id,
                part_id=part.id,
                quantity=float(qty),
                reserved=0.0,
            )
            db.add(sl)

            # Registro del movimiento inicial
            mov = InventoryMovement(
                branch_id=BRANCH_IDS[branch_key],
                warehouse_id=wh_main.id,
                part_id=part.id,
                movement_type=InventoryMovementType.inbound.value,
                quantity=float(qty),
                unit_cost=part.last_unit_cost,
                reason="Stock inicial seed",
            )
            db.add(mov)
            movements += 1
    return movements


def _ensure_vehicles(db) -> dict[str, list[Vehicle]]:
    out: dict[str, list[Vehicle]] = {}
    for branch_key, vehicles_data in VEHICLES_PER_BRANCH.items():
        branch_id = BRANCH_IDS[branch_key]
        v_list: list[Vehicle] = []
        for customer, contact, brand, model, year, plates, vin, mileage in vehicles_data:
            existing = db.query(Vehicle).filter(Vehicle.plates == plates).first()
            if existing:
                v_list.append(existing)
                continue
            v = Vehicle(
                branch_id=branch_id,
                customer_name=customer, contact=contact,
                brand=brand, model=model, year=year,
                plates=plates, vin=vin, mileage=mileage,
                active=True,
            )
            db.add(v)
            db.flush()
            v_list.append(v)
        out[branch_key] = v_list
    return out


def _ensure_work_orders(db, vehicles: dict[str, list[Vehicle]]) -> int:
    """Crea OS distribuidas en distintos status para cada sede."""
    # Necesitamos al menos un model + service base; crear demos si no existen
    model = db.query(VehicleModel).filter(VehicleModel.active.is_(True)).first()
    if not model:
        model = VehicleModel(name="DEMO MODEL", brand="DEMO", active=True)
        db.add(model)
        db.flush()
        print("  ℹ Creado VehicleModel demo (no había catálogo)")
    service = db.query(Service).filter(Service.active.is_(True)).first()
    if not service:
        service = Service(name="Servicio general", category="general", active=True)
        db.add(service)
        db.flush()
        print("  ℹ Creado Service demo (no había catálogo)")

    mecanico = db.query(User).filter(User.email == "mecanico.leon@bjx.com").first()
    jefe = db.query(User).filter(User.email == "jefe.leon@bjx.com").first()

    statuses_per_branch = {
        "LEON": [WorkOrderStatus.received] * 2 + [WorkOrderStatus.in_progress] * 3 + [WorkOrderStatus.waiting_parts],
        "QRO":  [WorkOrderStatus.received, WorkOrderStatus.in_progress, WorkOrderStatus.in_progress, WorkOrderStatus.completed],
        "GDL":  [WorkOrderStatus.received, WorkOrderStatus.in_progress],
        "MAIN": [],
    }

    created = 0
    now = datetime.now(timezone.utc)

    for branch_key, statuses in statuses_per_branch.items():
        v_list = vehicles.get(branch_key, [])
        if not v_list:
            continue
        branch_id = BRANCH_IDS[branch_key]

        for idx, status in enumerate(statuses):
            order_number = f"WO-2026-{branch_key[:3].upper()}{idx+1:03d}"
            existing = db.query(WorkOrder).filter(WorkOrder.order_number == order_number).first()
            if existing:
                continue

            vehicle = v_list[idx % len(v_list)]
            received_at = now - timedelta(hours=random.randint(2, 72))
            wo = WorkOrder(
                branch_id=branch_id,
                order_number=order_number,
                vehicle_id=vehicle.id,
                model_id=model.id,
                service_id=service.id,
                assigned_mechanic_id=(mecanico.id if branch_key == "LEON" and mecanico else None),
                status=status,
                received_at=received_at,
                work_started_at=(received_at + timedelta(minutes=15)) if status != WorkOrderStatus.received else None,
                work_finished_at=(received_at + timedelta(hours=4)) if status == WorkOrderStatus.completed else None,
                notes=f"OS de prueba {branch_key} #{idx+1}",
            )
            db.add(wo)
            created += 1

    # Solicitudes de inventario para LEON (para el flujo)
    if mecanico and jefe:
        leon_wos = db.query(WorkOrder).filter(WorkOrder.branch_id == BRANCH_IDS["LEON"]).limit(2).all()
        skus_to_request = ["FLT-OIL-001", "BRK-PAD-001"]
        for i, wo in enumerate(leon_wos):
            sku = skus_to_request[i % len(skus_to_request)]
            part = db.query(Part).filter(Part.sku == sku).first()
            if not part:
                continue
            existing = (
                db.query(InventoryRequest)
                .filter(
                    InventoryRequest.work_order_id == wo.id,
                    InventoryRequest.part_id == part.id,
                )
                .first()
            )
            if existing:
                continue
            req = InventoryRequest(
                branch_id=BRANCH_IDS["LEON"],
                work_order_id=wo.id,
                requested_by=mecanico.id,
                part_id=part.id,
                quantity=2.0,
                priority="normal" if i == 0 else "high",
                status=InventoryRequestStatus.pending.value if i == 0 else InventoryRequestStatus.approved.value,
                approved_by=jefe.id if i == 1 else None,
                notes=f"Solicitud demo {i+1}",
            )
            db.add(req)
    return created


def main() -> None:
    db_url = os.getenv("DATABASE_URL", "sqlite:///./bjx_dev.db")
    print(f"[SEED-OPS] DATABASE_URL = {db_url}")

    db = SessionLocal()
    try:
        existing_branch_ids = {b.id for b in db.query(Branch).all()}
        missing = [b for b in BRANCH_IDS.values() if b not in existing_branch_ids]
        if missing:
            print(f"[ERROR] Branches faltantes: {missing}. Corre alembic upgrade head primero.")
            sys.exit(1)

        print("[SEED-OPS] 1. Catálogo de partes…")
        parts = _ensure_parts(db)
        db.commit()
        print(f"  ✓ {len(parts)} partes (skip si ya existían)")

        print("[SEED-OPS] 2. Almacenes por sede…")
        warehouses = _ensure_warehouses(db)
        db.commit()
        for k, v in warehouses.items():
            print(f"  ✓ {k}: {len(v)} almacén(es)")

        print("[SEED-OPS] 3. Stock distribuido…")
        movs = _ensure_stock(db, warehouses, parts)
        db.commit()
        print(f"  ✓ {movs} movimientos inbound iniciales")

        print("[SEED-OPS] 4. Vehículos por sede…")
        vehicles = _ensure_vehicles(db)
        db.commit()
        for k, v in vehicles.items():
            print(f"  ✓ {k}: {len(v)} vehículos")

        print("[SEED-OPS] 5. Órdenes de trabajo…")
        wos = _ensure_work_orders(db, vehicles)
        db.commit()
        print(f"  ✓ {wos} OS creadas")

        print()
        print("[SEED-OPS] Listo — datos diferenciales por sede sembrados.")
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Seed falló: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
