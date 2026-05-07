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
    "CDMX": "00000000-0000-0000-0000-0000000000ae",
    "MTY":  "00000000-0000-0000-0000-0000000000af",
    "PUE":  "00000000-0000-0000-0000-0000000000b0",
    "TIJ":  "00000000-0000-0000-0000-0000000000b1",
    "SLP":  "00000000-0000-0000-0000-0000000000b2",
    "AGS":  "00000000-0000-0000-0000-0000000000b3",
}


PARTS_CATALOG = [
    # SKU, name, category, unit, min_stock, lead, cost
    # ── Filtros ─────────────────────────────────────────
    ("FLT-OIL-001",  "Filtro de aceite estándar",       "filtros",     "pza", 5,  2,  120.00),
    ("FLT-OIL-002",  "Filtro de aceite premium",        "filtros",     "pza", 3,  3,  240.00),
    ("FLT-AIR-001",  "Filtro de aire motor",            "filtros",     "pza", 3,  3,  180.00),
    ("FLT-AIR-002",  "Filtro de aire deportivo K&N",    "filtros",     "pza", 1,  7,  1450.00),
    ("FLT-FUEL-001", "Filtro de gasolina",              "filtros",     "pza", 4,  3,  240.00),
    ("FLT-CAB-001",  "Filtro de cabina antipolen",      "filtros",     "pza", 3,  4,  320.00),

    # ── Lubricantes ─────────────────────────────────────
    ("OIL-5W30-001", "Aceite sintético 5W30 (1L)",      "lubricantes", "L",   12, 5,  220.00),
    ("OIL-5W30-005", "Aceite sintético 5W30 (5L)",      "lubricantes", "L",   3,  5,  980.00),
    ("OIL-10W40-001","Aceite mineral 10W40 (1L)",       "lubricantes", "L",   8,  5,  150.00),
    ("OIL-0W20-001", "Aceite full-synthetic 0W20 (1L)", "lubricantes", "L",   6,  6,  280.00),
    ("LIQ-FRN-001",  "Líquido de frenos DOT4 (500ml)",  "lubricantes", "ml",  4,  3,  180.00),
    ("LIQ-DIR-001",  "Aceite dirección hidráulica",     "lubricantes", "L",   3,  4,  220.00),
    ("LIQ-REF-001",  "Refrigerante coolant verde 5L",   "lubricantes", "L",   2,  4,  450.00),

    # ── Frenos ──────────────────────────────────────────
    ("BRK-PAD-001",  "Balatas delanteras (juego)",      "frenos",      "set", 2,  4,  680.00),
    ("BRK-PAD-002",  "Balatas traseras (juego)",        "frenos",      "set", 2,  4,  580.00),
    ("BRK-PAD-003",  "Balatas cerámica premium",        "frenos",      "set", 1,  7,  1280.00),
    ("BRK-DSC-001",  "Disco de freno delantero",        "frenos",      "pza", 1,  6,  920.00),
    ("BRK-DSC-002",  "Disco de freno trasero",          "frenos",      "pza", 1,  6,  780.00),

    # ── Eléctrico/Ignición ──────────────────────────────
    ("BAT-12V-001",  "Batería 12V 60Ah",                "electrico",   "pza", 1,  7,  1850.00),
    ("BAT-12V-002",  "Batería 12V 75Ah",                "electrico",   "pza", 1,  7,  2380.00),
    ("BUJ-IRD-001",  "Bujía iridio (juego 4)",          "ignicion",    "set", 2,  5,  1280.00),
    ("BUJ-PLT-001",  "Bujía platino (juego 4)",         "ignicion",    "set", 2,  5,  680.00),
    ("ALT-12V-001",  "Alternador 90A reman",            "electrico",   "pza", 1,  10, 3200.00),

    # ── Suspensión ──────────────────────────────────────
    ("AMG-DEL-001",  "Amortiguador delantero",          "suspension",  "pza", 1,  10, 1650.00),
    ("AMG-TRA-001",  "Amortiguador trasero",            "suspension",  "pza", 1,  10, 1480.00),
    ("RES-DEL-001",  "Resorte delantero",               "suspension",  "pza", 1,  12, 980.00),
    ("BRJ-SUS-001",  "Buje de suspensión (par)",        "suspension",  "set", 2,  6,  340.00),

    # ── Transmisión ─────────────────────────────────────
    ("CRR-AUX-001",  "Banda accesorios poly-V",         "transmision", "pza", 1,  6,  450.00),
    ("CRR-DIST-001", "Banda de distribución",           "transmision", "pza", 1,  8,  1240.00),
    ("EMB-KIT-001",  "Kit de embrague completo",        "transmision", "set", 1,  14, 4800.00),

    # ── Llantas/Neumáticos ──────────────────────────────
    ("LLT-185-65",   "Llanta 185/65 R15 estándar",      "llantas",     "pza", 4,  5,  1450.00),
    ("LLT-205-55",   "Llanta 205/55 R16 deportiva",     "llantas",     "pza", 2,  6,  2150.00),

    # ── Consumibles ─────────────────────────────────────
    ("WIP-ART-001",  "Limpiaparabrisas par 18\"+22\"",  "consumibles", "set", 4,  3,  280.00),
    ("ESP-RET-001",  "Espejo retrovisor lateral L/R",   "carroceria",  "pza", 1,  7,  680.00),
]

WAREHOUSE_PLAN = {
    "MAIN": [("M1", "Almacén corporativo BJX", "main")],
    "LEON": [("A1", "Almacén central León", "main"),
             ("A2", "Almacén satélite León", "satellite")],
    "QRO":  [("Q1", "Almacén central Querétaro", "main")],
    "GDL":  [("G1", "Almacén central Guadalajara", "main")],
    "CDMX": [("C1", "Almacén central CDMX", "main"),
             ("C2", "Almacén Polanco CDMX", "satellite")],
    "MTY":  [("MT1", "Almacén central Monterrey", "main"),
             ("MT2", "Almacén San Pedro MTY", "satellite")],
    "PUE":  [("P1", "Almacén central Puebla", "main")],
    "TIJ":  [("T1", "Almacén central Tijuana", "main")],
    "SLP":  [("S1", "Almacén central San Luis", "main")],
    "AGS":  [("AG1", "Almacén central Aguascalientes", "main")],
}

# (n_parts_a_sembrar, profile) — profile dicta volumen de stock
# profiles: "premium" 25-80, "high" 18-55, "medium" 10-30, "low" 4-15, "starter" 2-8
STOCK_PROFILE = {
    "MAIN": (35, "premium"),  # corporativo, todo el catálogo
    "LEON": (28, "high"),
    "CDMX": (30, "high"),
    "MTY":  (25, "high"),
    "QRO":  (20, "medium"),
    "GDL":  (18, "medium"),
    "PUE":  (15, "medium"),
    "SLP":  (12, "low"),
    "TIJ":  (10, "low"),
    "AGS":  (8,  "starter"),  # arranque, stock reducido
}

VEHICLES_PER_BRANCH = {
    "MAIN": [
        ("Cliente Demo 1", "5500000001", "Nissan", "Sentra", 2022, "DEMO-001", "1HGBH41JXMN900001", 15000),
        ("Cliente Demo 2", "5500000002", "Honda", "Civic",   2021, "DEMO-002", "1HGBH41JXMN900002", 25000),
    ],
    "LEON": [
        ("Ana Rodríguez",    "5512345678", "Nissan",    "Versa",     2021, "GLZ-1234", "1HGBH41JXMN100001", 45000),
        ("Carlos Méndez",    "5523456789", "Chevrolet", "Aveo",      2019, "MEX-5678", "1HGBH41JXMN100002", 78000),
        ("María López",      "5534567890", "Ford",      "Fiesta",    2020, "JAL-9012", "1HGBH41JXMN100003", 52000),
        ("Luis Hernández",   "5545678901", "Nissan",    "March",     2022, "QRO-3456", "1HGBH41JXMN100004", 28000),
        ("Patricia Soto",    "5556789012", "Volkswagen","Vento",     2018, "GTO-7890", "1HGBH41JXMN100005", 95000),
        ("Roberto García",   "5567890123", "Toyota",    "Yaris",     2021, "AGS-1122", "1HGBH41JXMN100006", 38000),
        ("Diana Pérez",      "5578901234", "Honda",     "City",      2020, "SLP-3344", "1HGBH41JXMN100007", 62000),
        ("Fernando Ruiz",    "5589012345", "Mazda",     "3",         2019, "BCN-5566", "1HGBH41JXMN100008", 81000),
    ],
    "QRO": [
        ("Sandra Torres",    "4421234567", "Nissan",    "Sentra",    2020, "QRO-7788", "1HGBH41JXMN200001", 49000),
        ("Miguel Castro",    "4432345678", "Chevrolet", "Spark",     2021, "QRO-9900", "1HGBH41JXMN200002", 33000),
        ("Laura Vázquez",    "4443456789", "Ford",      "Figo",      2018, "QRO-1010", "1HGBH41JXMN200003", 88000),
        ("Eduardo Romero",   "4454567890", "Hyundai",   "Grand i10", 2022, "QRO-1212", "1HGBH41JXMN200004", 22000),
        ("Mónica Ramírez",   "4465678901", "Kia",       "Rio",       2019, "QRO-1414", "1HGBH41JXMN200005", 71000),
    ],
    "GDL": [
        ("Jorge Aguilar",    "3312345678", "Nissan",    "Versa",     2020, "JAL-2233", "1HGBH41JXMN300001", 56000),
        ("Cristina Núñez",   "3323456789", "Volkswagen","Polo",      2021, "JAL-4455", "1HGBH41JXMN300002", 41000),
        ("Andrés Cano",      "3334567890", "Toyota",    "Corolla",   2019, "JAL-6677", "1HGBH41JXMN300003", 92000),
        ("Verónica Mena",    "3345678901", "Mazda",     "CX-5",      2022, "JAL-8899", "1HGBH41JXMN300004", 18000),
    ],
    "CDMX": [
        ("Alejandro Solís",  "5511223344", "Audi",      "A4",        2022, "CDX-1001", "1HGBH41JXMN400001", 12000),
        ("Beatriz Olvera",   "5522334455", "BMW",       "Serie 3",   2021, "CDX-1002", "1HGBH41JXMN400002", 28000),
        ("Carlos Iturbide",  "5533445566", "Nissan",    "X-Trail",   2020, "CDX-1003", "1HGBH41JXMN400003", 67000),
        ("Daniela Mejía",    "5544556677", "Volkswagen","Jetta",     2019, "CDX-1004", "1HGBH41JXMN400004", 89000),
        ("Esteban Vargas",   "5555667788", "Honda",     "CR-V",      2022, "CDX-1005", "1HGBH41JXMN400005", 24000),
        ("Fátima Cordero",   "5566778899", "Toyota",    "Camry",     2021, "CDX-1006", "1HGBH41JXMN400006", 41000),
        ("Gerardo Bravo",    "5577889900", "Mazda",     "CX-30",     2020, "CDX-1007", "1HGBH41JXMN400007", 58000),
        ("Helena Pacheco",   "5588990011", "Hyundai",   "Tucson",    2022, "CDX-1008", "1HGBH41JXMN400008", 19000),
        ("Iván Ortega",      "5599001122", "Kia",       "Sportage",  2021, "CDX-1009", "1HGBH41JXMN400009", 36000),
        ("Julia Reyes",      "5500112233", "Ford",      "Escape",    2019, "CDX-1010", "1HGBH41JXMN400010", 102000),
    ],
    "MTY": [
        ("Karla Cantú",      "8112345678", "Nissan",    "Frontier",  2021, "MTY-2001", "1HGBH41JXMN500001", 47000),
        ("Luis Lozano",      "8123456789", "Chevrolet", "Cheyenne",  2020, "MTY-2002", "1HGBH41JXMN500002", 73000),
        ("Marcela Salinas",  "8134567890", "Ford",      "Lobo",      2022, "MTY-2003", "1HGBH41JXMN500003", 22000),
        ("Néstor Garza",     "8145678901", "Toyota",    "Tacoma",    2019, "MTY-2004", "1HGBH41JXMN500004", 98000),
        ("Olga Tamez",       "8156789012", "Honda",     "Pilot",     2021, "MTY-2005", "1HGBH41JXMN500005", 39000),
        ("Pablo Cisneros",   "8167890123", "Mazda",     "BT-50",     2018, "MTY-2006", "1HGBH41JXMN500006", 110000),
        ("Quintana Téllez",  "8178901234", "Volkswagen","Amarok",    2020, "MTY-2007", "1HGBH41JXMN500007", 65000),
        ("Ricardo Villarreal","8189012345","Nissan",    "Sentra",    2022, "MTY-2008", "1HGBH41JXMN500008", 18000),
        ("Sofía Marroquín",  "8190123456", "Kia",       "Forte",     2021, "MTY-2009", "1HGBH41JXMN500009", 32000),
    ],
    "PUE": [
        ("Tomás Aguirre",    "2221234567", "Volkswagen","Vento",     2020, "PUE-3001", "1HGBH41JXMN600001", 51000),
        ("Úrsula Bautista",  "2222345678", "Nissan",    "March",     2021, "PUE-3002", "1HGBH41JXMN600002", 28000),
        ("Víctor Castañeda", "2223456789", "Chevrolet", "Spark",     2018, "PUE-3003", "1HGBH41JXMN600003", 92000),
        ("Wendy Domínguez",  "2224567890", "Ford",      "EcoSport",  2022, "PUE-3004", "1HGBH41JXMN600004", 14000),
    ],
    "TIJ": [
        ("Xavier Espinoza",  "6641234567", "Nissan",    "NP300",     2020, "TIJ-4001", "1HGBH41JXMN700001", 78000),
        ("Yolanda Fonseca",  "6642345678", "Toyota",    "Hilux",     2021, "TIJ-4002", "1HGBH41JXMN700002", 45000),
        ("Zacarías Gómez",   "6643456789", "Chevrolet", "Trax",      2019, "TIJ-4003", "1HGBH41JXMN700003", 86000),
    ],
    "SLP": [
        ("Adriana Hidalgo",  "4441234567", "Nissan",    "Versa",     2021, "SLP-5001", "1HGBH41JXMN800001", 36000),
        ("Bruno Iglesias",   "4442345678", "Honda",     "Civic",     2020, "SLP-5002", "1HGBH41JXMN800002", 54000),
        ("Camila Juárez",    "4443456789", "Volkswagen","Polo",      2022, "SLP-5003", "1HGBH41JXMN800003", 19000),
        ("Diego Krause",     "4444567890", "Mazda",     "2",         2018, "SLP-5004", "1HGBH41JXMN800004", 99000),
    ],
    "AGS": [
        ("Erika Limón",      "4491234567", "Nissan",    "Sentra",    2020, "AGS-6001", "1HGBH41JXMN810001", 67000),
        ("Federico Mora",    "4492345678", "Chevrolet", "Onix",      2022, "AGS-6002", "1HGBH41JXMN810002", 21000),
        ("Gabriela Núñez",   "4493456789", "Kia",       "Rio",       2019, "AGS-6003", "1HGBH41JXMN810003", 81000),
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
    profile_qty = {
        "premium": (25, 80),  # corp / matriz
        "high":    (18, 55),
        "medium":  (10, 30),
        "low":     (4,  15),
        "starter": (2,  8),   # sede en arranque
    }
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

    # Distribución realista por sede: las grandes tienen más OS activas,
    # las starter tienen pocas pero presentes.
    R = WorkOrderStatus.received
    P = WorkOrderStatus.in_progress
    W = WorkOrderStatus.waiting_parts
    C = WorkOrderStatus.completed
    D = WorkOrderStatus.delivered

    statuses_per_branch = {
        "MAIN": [],  # corp no opera taller
        "LEON": [R, R, P, P, P, W, C, D],
        "CDMX": [R, R, R, P, P, P, P, W, C, C, D],
        "MTY":  [R, R, P, P, P, W, C, D, D],
        "QRO":  [R, P, P, W, C, D],
        "GDL":  [R, P, P, C],
        "PUE":  [R, P, C],
        "SLP":  [R, P, C],
        "TIJ":  [R, P],
        "AGS":  [R, P],
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
            received_at = now - timedelta(hours=random.randint(2, 96))
            wo = WorkOrder(
                branch_id=branch_id,
                order_number=order_number,
                vehicle_id=vehicle.id,
                model_id=model.id,
                service_id=service.id,
                assigned_mechanic_id=(mecanico.id if branch_key == "LEON" and mecanico else None),
                status=status,
                received_at=received_at,
                work_started_at=(received_at + timedelta(minutes=15)) if status != R else None,
                work_finished_at=(received_at + timedelta(hours=4)) if status in (C, D) else None,
                closed_at=(received_at + timedelta(hours=6)) if status == D else None,
                notes=f"OS de prueba {branch_key} #{idx+1}",
            )
            db.add(wo)
            created += 1

    # Flush para que las OS recién agregadas sean visibles a la query siguiente
    # (la session corre con autoflush=False en este proyecto).
    db.flush()

    # Solicitudes de inventario en distintos estados para flujo completo
    if mecanico and jefe:
        leon_wos = db.query(WorkOrder).filter(WorkOrder.branch_id == BRANCH_IDS["LEON"]).limit(4).all()
        skus_to_request = ["FLT-OIL-001", "BRK-PAD-001", "OIL-5W30-001", "BUJ-IRD-001"]
        statuses_req = [
            InventoryRequestStatus.pending,
            InventoryRequestStatus.approved,
            InventoryRequestStatus.delivered,
            InventoryRequestStatus.used,
        ]
        for i, wo in enumerate(leon_wos):
            sku = skus_to_request[i % len(skus_to_request)]
            req_status = statuses_req[i % len(statuses_req)]
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
            priorities = ["normal", "high", "normal", "urgent"]
            req = InventoryRequest(
                branch_id=BRANCH_IDS["LEON"],
                work_order_id=wo.id,
                requested_by=mecanico.id,
                part_id=part.id,
                quantity=2.0,
                priority=priorities[i % len(priorities)],
                status=req_status.value,
                approved_by=(jefe.id if req_status != InventoryRequestStatus.pending else None),
                notes=f"Solicitud demo {req_status.value} #{i+1}",
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
