"""
seeds/load_data.py
==================
Script de seed idempotente para BJX-Atlas-Api.

Carga datos desde los archivos Excel de contexto:
  - BJX_Calculadora_Brame_v1.xlsx  → service_catalog + supplier_prices (Brame)

Uso:
    python seeds/load_data.py
    python seeds/load_data.py --dry-run
"""

import os
import sys

# Asegurar que el import de app.* funcione desde la carpeta seeds/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import re
from datetime import date
from typing import Optional

import openpyxl

from app.database import SessionLocal, engine, Base
from app.models.catalog import VehicleModel, Service, ServiceCatalog
from app.models.suppliers import Supplier, SupplierPrice
from app.models.config import ConfigParam
from app.models.users import User, Role

# ---------------------------------------------------------------------------
# Tabla de normalización de nombres de modelo
# ---------------------------------------------------------------------------

NORMALIZATIONS: dict[str, str] = {
    "NISSAN - MARCH": "NISSAN MARCH",
    "CHEVROLET - TORNADO PICK UP": "CHEVROLET - TORNADO PU",
    "VOLKSWAGEN - SAVEIRO ": "VOLKSWAGEN - SAVEIRO",
}

# ---------------------------------------------------------------------------
# Defaults de configuración
# ---------------------------------------------------------------------------

DEFAULTS: dict[str, tuple[str, str]] = {
    "technician_cost_hr": ("156.25", "Costo por hora del técnico BJX en MXN"),
    "target_margin": ("0.40", "Margen objetivo por defecto (40%)"),
    "iva_rate": ("0.16", "Tasa IVA"),
    "overhead_rate": ("0.15", "Tasa de overhead operativo"),
    "scoring_weight_price": ("0.50", "Peso del precio en scoring de proveedores"),
    "scoring_weight_time": ("0.30", "Peso del tiempo de entrega en scoring"),
    "scoring_weight_tc": ("0.20", "Peso de términos y condiciones en scoring"),
}


# ---------------------------------------------------------------------------
# Helpers de parsing
# ---------------------------------------------------------------------------

def parse_currency(value) -> Optional[float]:
    """
    Convierte valores de moneda a float.

    Ejemplos:
        "MX$1,449.23"  → 1449.23
        "$500"         → 500.0
        1449.23        → 1449.23
        None / ""      → None
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        import math
        if math.isnan(value):
            return None
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    # Remover prefijos de moneda, espacios y comas
    text = re.sub(r"[MX$\s,]", "", text)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_float(value) -> Optional[float]:
    """Convierte un valor a float; None si vacío o no numérico."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        import math
        if math.isnan(value):
            return None
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def normalize_model_name(name: str) -> str:
    """
    Normaliza el nombre del modelo aplicando la tabla NORMALIZATIONS.
    Si no está en la tabla, aplica strip() y retorna tal cual.
    """
    # Intentar lookup exacto (incluyendo trailing spaces)
    if name in NORMALIZATIONS:
        return NORMALIZATIONS[name]
    # También probar con strip por si hay variaciones de espacios no previstas
    stripped = name.strip()
    if stripped in NORMALIZATIONS:
        return NORMALIZATIONS[stripped]
    # Buscar con trailing space (clave "VOLKSWAGEN - SAVEIRO ")
    for key, val in NORMALIZATIONS.items():
        if key.strip() == stripped:
            return val
    return stripped


def is_empty_row(row_values: tuple) -> bool:
    """Retorna True si todos los valores de la fila son None o vacíos."""
    return all(v is None or str(v).strip() == "" for v in row_values)


# ---------------------------------------------------------------------------
# Funciones de upsert
# ---------------------------------------------------------------------------

def get_or_create_model(db, name: str, brand: str = None) -> VehicleModel:
    """
    Obtiene o crea un VehicleModel por nombre normalizado (case-insensitive).
    """
    normalized = normalize_model_name(name)
    key = normalized.lower().strip()

    # Buscar existente (case-insensitive via Python para compatibilidad SQLite/Postgres)
    existing = db.query(VehicleModel).filter(VehicleModel.active == True).all()
    for m in existing:
        if m.name.lower().strip() == key:
            return m

    # Inferir brand del nombre si no se proporciona
    if brand is None and " - " in normalized:
        brand = normalized.split(" - ")[0].strip()
    elif brand is None and " " in normalized:
        brand = normalized.split(" ")[0].strip()

    model = VehicleModel(name=normalized, brand=brand, active=True)
    db.add(model)
    db.flush()
    return model


def get_or_create_service(db, name: str, category: str = "otros") -> Service:
    """
    Obtiene o crea un Service por nombre normalizado (case-insensitive).
    """
    key = name.lower().strip()

    existing = db.query(Service).filter(Service.active == True).all()
    for s in existing:
        if s.name.lower().strip() == key:
            return s

    service = Service(name=name.strip(), category=category, active=True)
    db.add(service)
    db.flush()
    return service


# ---------------------------------------------------------------------------
# Seed de config params
# ---------------------------------------------------------------------------

def seed_config_params(db, dry_run: bool = False) -> int:
    """
    Inserta los parámetros de configuración default si no existen.
    Retorna cantidad de registros insertados.
    """
    inserted = 0
    for key, (value, description) in DEFAULTS.items():
        existing = db.query(ConfigParam).filter(ConfigParam.key == key).first()
        if existing:
            continue
        if dry_run:
            print(f"  [DRY-RUN] Insertaría config: {key} = {value}")
        else:
            param = ConfigParam(key=key, value=value, description=description)
            db.add(param)
            inserted += 1
    if not dry_run and inserted > 0:
        db.flush()
    return inserted


# ---------------------------------------------------------------------------
# Parsing del Excel de Brame
# ---------------------------------------------------------------------------

def _find_header_row(ws, max_scan: int = 20) -> Optional[int]:
    """
    Detecta la fila de encabezado buscando palabras clave.
    Retorna el índice de fila (1-based) o None si no se encuentra.
    """
    keywords = {"modelo", "servicio", "concepto", "descripcion", "descripción",
                "mo", "ref", "total", "pasado", "actualizado", "duración", "duracion"}
    for row_idx in range(1, max_scan + 1):
        row_vals = [str(ws.cell(row_idx, col).value or "").lower().strip()
                    for col in range(1, ws.max_column + 1)]
        matches = sum(1 for v in row_vals if any(kw in v for kw in keywords))
        if matches >= 2:
            return row_idx
    return None


def _map_columns(header_row: list[str]) -> dict:
    """
    Construye un mapa de {nombre_lógico: col_index} basado en la fila de encabezado.
    Usa heurísticas para detectar columnas de modelo, servicio, costos, etc.

    Retorna dict con claves:
        modelo, servicio, mo_pasado, ref_pasado, total_pasado,
        mo_actual, ref_actual, total_actual, duracion
    """
    mapping = {}
    headers_lower = [str(h).lower().strip() for h in header_row]

    for i, h in enumerate(headers_lower):
        if not mapping.get("modelo") and ("modelo" in h or "vehículo" in h or "vehiculo" in h):
            mapping["modelo"] = i
        elif not mapping.get("servicio") and (
            "servicio" in h or "concepto" in h or "descripci" in h
        ):
            mapping["servicio"] = i
        elif not mapping.get("duracion") and ("durac" in h or "hrs" in h or "hora" in h):
            mapping["duracion"] = i

    # Columnas de precios: detectar por combinación pasado/actual + mo/ref/total
    pasado_indices = [i for i, h in enumerate(headers_lower) if "pasado" in h]
    actual_indices = [i for i, h in enumerate(headers_lower) if "actual" in h]

    # Estrategia: dentro de cada grupo (pasado/actual) buscar MO, REF, Total
    def _find_price_cols(group_indices: list[int], all_headers: list[str]) -> dict:
        result = {}
        for i in group_indices:
            h = all_headers[i]
            if "mo" in h or "mano" in h or "labor" in h:
                result["mo"] = i
            elif "ref" in h or "refaccion" in h or "part" in h or "pieza" in h:
                result["ref"] = i
            elif "total" in h or "precio" in h:
                result["total"] = i
        return result

    if pasado_indices:
        p = _find_price_cols(pasado_indices, headers_lower)
        mapping["mo_pasado"] = p.get("mo")
        mapping["ref_pasado"] = p.get("ref")
        mapping["total_pasado"] = p.get("total")

    if actual_indices:
        a = _find_price_cols(actual_indices, headers_lower)
        mapping["mo_actual"] = a.get("mo")
        mapping["ref_actual"] = a.get("ref")
        mapping["total_actual"] = a.get("total")

    # Fallback: si no se detectaron grupos explícitos, inferir por posición
    # Buscar columnas con "MO", "REF", "Total" en el encabezado
    if not pasado_indices and not actual_indices:
        mo_cols = [i for i, h in enumerate(headers_lower) if h in ("mo",) or "mano de obra" in h]
        ref_cols = [i for i, h in enumerate(headers_lower) if h in ("ref", "refacción", "refaccion")]
        total_cols = [i for i, h in enumerate(headers_lower) if "total" in h]

        if len(mo_cols) >= 2:
            mapping["mo_pasado"] = mo_cols[0]
            mapping["mo_actual"] = mo_cols[1]
        elif len(mo_cols) == 1:
            mapping["mo_actual"] = mo_cols[0]

        if len(ref_cols) >= 2:
            mapping["ref_pasado"] = ref_cols[0]
            mapping["ref_actual"] = ref_cols[1]
        elif len(ref_cols) == 1:
            mapping["ref_actual"] = ref_cols[0]

        if len(total_cols) >= 2:
            mapping["total_pasado"] = total_cols[0]
            mapping["total_actual"] = total_cols[1]
        elif len(total_cols) == 1:
            mapping["total_actual"] = total_cols[0]

    return mapping


def load_brame_excel(
    db,
    filepath: str,
    dry_run: bool = False,
) -> dict:
    """
    Lee el Excel de la Calculadora Brame y carga los datos en:
      - VehicleModel / Service  (catálogo)
      - ServiceCatalog          (costos BJX)
      - Supplier / SupplierPrice (precios Brame)

    El Excel puede tener una o múltiples hojas. Cada hoja puede representar
    un modelo de vehículo o contener todos los modelos juntos.

    Retorna dict con conteos: models, services, catalog_entries, brame_prices.
    """
    stats = {
        "models": 0,
        "services": 0,
        "catalog_entries": 0,
        "brame_prices_past": 0,
        "brame_prices_current": 0,
        "errors": 0,
    }

    if not os.path.exists(filepath):
        print(f"[WARN] Archivo no encontrado: {filepath}")
        return stats

    print(f"\n[INFO] Leyendo Excel: {filepath}")
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    print(f"[INFO] Hojas encontradas: {wb.sheetnames}")

    # Asegurar proveedor Brame en DB
    if not dry_run:
        brame_supplier = db.query(Supplier).filter(
            Supplier.name.ilike("brame")
        ).first()
        if not brame_supplier:
            brame_supplier = Supplier(
                name="BRAME",
                lead_time_days=1,
                warranty_days=30,
                active=True,
            )
            db.add(brame_supplier)
            db.flush()
    else:
        brame_supplier = None

    today = date.today()

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        print(f"\n[INFO] Procesando hoja: '{sheet_name}'")

        # Detectar fila de encabezado
        header_row_idx = _find_header_row(ws)
        if header_row_idx is None:
            print(f"  [SKIP] No se encontró encabezado en hoja '{sheet_name}'")
            continue

        # Leer encabezado
        header_values = [
            ws.cell(header_row_idx, col).value
            for col in range(1, ws.max_column + 1)
        ]
        print(f"  [INFO] Encabezado en fila {header_row_idx}: {header_values}")

        col_map = _map_columns(header_values)
        print(f"  [INFO] Mapa de columnas: {col_map}")

        # Determinar si el modelo viene del nombre de la hoja o de una columna
        sheet_as_model = col_map.get("modelo") is None
        if sheet_as_model:
            # El nombre de la hoja es el modelo
            sheet_model_name = normalize_model_name(sheet_name)
            print(f"  [INFO] Modelo del nombre de hoja: '{sheet_model_name}'")

        # Iterar filas de datos
        for row_idx in range(header_row_idx + 1, ws.max_row + 1):
            row_vals = tuple(
                ws.cell(row_idx, col).value
                for col in range(1, ws.max_column + 1)
            )

            if is_empty_row(row_vals):
                continue

            try:
                # --- Determinar modelo ---
                if sheet_as_model:
                    raw_model = sheet_name
                else:
                    raw_model = str(row_vals[col_map["modelo"]] or "").strip()
                    if not raw_model:
                        continue

                model_name = normalize_model_name(raw_model)

                # --- Determinar servicio ---
                svc_col = col_map.get("servicio")
                if svc_col is None:
                    print(f"  [SKIP] Row {row_idx}: no se detectó columna de servicio")
                    stats["errors"] += 1
                    continue

                raw_service = str(row_vals[svc_col] or "").strip()
                if not raw_service:
                    continue

                # --- Costos ---
                dur_col = col_map.get("duracion")
                duration_hrs = parse_float(row_vals[dur_col]) if dur_col is not None else None
                if duration_hrs is None:
                    duration_hrs = 0.0  # default si no hay columna de duración

                mo_actual = parse_currency(
                    row_vals[col_map["mo_actual"]] if col_map.get("mo_actual") is not None else None
                )
                ref_actual = parse_currency(
                    row_vals[col_map["ref_actual"]] if col_map.get("ref_actual") is not None else None
                )
                total_actual = parse_currency(
                    row_vals[col_map["total_actual"]] if col_map.get("total_actual") is not None else None
                )

                mo_pasado = parse_currency(
                    row_vals[col_map["mo_pasado"]] if col_map.get("mo_pasado") is not None else None
                )
                ref_pasado = parse_currency(
                    row_vals[col_map["ref_pasado"]] if col_map.get("ref_pasado") is not None else None
                )
                total_pasado = parse_currency(
                    row_vals[col_map["total_pasado"]] if col_map.get("total_pasado") is not None else None
                )

                if dry_run:
                    print(
                        f"  [DRY-RUN] Row {row_idx}: modelo='{model_name}' servicio='{raw_service}' "
                        f"mo_actual={mo_actual} ref_actual={ref_actual} total_actual={total_actual} "
                        f"mo_pasado={mo_pasado} ref_pasado={ref_pasado} total_pasado={total_pasado} "
                        f"duration_hrs={duration_hrs}"
                    )
                    stats["catalog_entries"] += 1
                    if total_actual is not None:
                        stats["brame_prices_current"] += 1
                    if total_pasado is not None:
                        stats["brame_prices_past"] += 1
                    continue

                # --- Upsert modelo y servicio ---
                vehicle_model = get_or_create_model(db, model_name)
                if vehicle_model.name.lower() not in [
                    m.name.lower() for m in db.query(VehicleModel).all()
                    if m.id != vehicle_model.id
                ]:
                    pass  # ya gestionado en get_or_create_model

                service = get_or_create_service(db, raw_service)

                # --- ServiceCatalog (costos BJX actuales) ---
                existing_catalog = (
                    db.query(ServiceCatalog)
                    .filter(
                        ServiceCatalog.model_id == vehicle_model.id,
                        ServiceCatalog.service_id == service.id,
                        ServiceCatalog.is_current == True,
                    )
                    .first()
                )
                if not existing_catalog:
                    entry = ServiceCatalog(
                        model_id=vehicle_model.id,
                        service_id=service.id,
                        bjx_labor_cost=mo_actual,
                        bjx_parts_cost=ref_actual,
                        duration_hrs=duration_hrs,
                        source="brame_xlsx",
                        is_current=True,
                        updated_by="seed",
                    )
                    db.add(entry)
                    stats["catalog_entries"] += 1

                # --- SupplierPrice ACTUAL (is_current=True) ---
                if total_actual is not None:
                    existing_price_current = (
                        db.query(SupplierPrice)
                        .filter(
                            SupplierPrice.supplier_id == brame_supplier.id,
                            SupplierPrice.service_id == service.id,
                            SupplierPrice.model_id == vehicle_model.id,
                            SupplierPrice.is_current == True,
                        )
                        .first()
                    )
                    if not existing_price_current:
                        sp_current = SupplierPrice(
                            supplier_id=brame_supplier.id,
                            service_id=service.id,
                            model_id=vehicle_model.id,
                            ref_cost=ref_actual if ref_actual is not None else 0.0,
                            labor_cost=mo_actual if mo_actual is not None else 0.0,
                            total_price=total_actual,
                            price_date=today,
                            is_current=True,
                        )
                        db.add(sp_current)
                        stats["brame_prices_current"] += 1

                # --- SupplierPrice PASADO (is_current=False) ---
                if total_pasado is not None:
                    existing_price_past = (
                        db.query(SupplierPrice)
                        .filter(
                            SupplierPrice.supplier_id == brame_supplier.id,
                            SupplierPrice.service_id == service.id,
                            SupplierPrice.model_id == vehicle_model.id,
                            SupplierPrice.is_current == False,
                        )
                        .first()
                    )
                    if not existing_price_past:
                        sp_past = SupplierPrice(
                            supplier_id=brame_supplier.id,
                            service_id=service.id,
                            model_id=vehicle_model.id,
                            ref_cost=ref_pasado if ref_pasado is not None else 0.0,
                            labor_cost=mo_pasado if mo_pasado is not None else 0.0,
                            total_price=total_pasado,
                            price_date=today,
                            is_current=False,
                        )
                        db.add(sp_past)
                        stats["brame_prices_past"] += 1

            except Exception as exc:
                reason = str(exc)
                print(f"  [SKIP] Row {row_idx}: {reason}")
                stats["errors"] += 1
                continue

        if not dry_run:
            try:
                db.flush()
            except Exception as exc:
                print(f"  [ERROR] Flush en hoja '{sheet_name}': {exc}")
                db.rollback()
                stats["errors"] += 1

    # Rastrear modelos y servicios nuevos
    if not dry_run:
        stats["models"] = db.query(VehicleModel).count()
        stats["services"] = db.query(Service).count()

    return stats


# ---------------------------------------------------------------------------
# Seed de usuario admin
# ---------------------------------------------------------------------------

def seed_admin_user(db, dry_run: bool = False) -> bool:
    """
    Crea el usuario admin si no existe.
    Retorna True si fue creado, False si ya existía.
    """
    from app.security import hash_password

    email = os.getenv("ADMIN_EMAIL", "admin@bjx.com")
    password = os.getenv("ADMIN_PASSWORD", "Admin1234")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        print(f"  [INFO] Usuario admin ya existe: {email}")
        return False

    if dry_run:
        print(f"  [DRY-RUN] Crearía usuario admin: {email}")
        return False

    user = User(
        email=email,
        hashed_password=hash_password(password),
        role=Role.admin,
        active=True,
    )
    db.add(user)
    db.flush()
    print(f"  [OK] Usuario admin creado: {email}")
    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Seed de datos para BJX-Atlas-Api"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Imprime qué haría sin escribir a la base de datos",
    )
    args = parser.parse_args()
    dry_run: bool = args.dry_run

    if dry_run:
        print("=" * 60)
        print("MODO DRY-RUN: no se escribirá nada en la base de datos")
        print("=" * 60)

    # Crear tablas si no existen (útil en desarrollo con SQLite)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    total_errors = 0

    try:
        # ---------------------------------------------------------------
        # 1. Config params
        # ---------------------------------------------------------------
        print("\n[STEP 1] Seed de config_params...")
        n_config = seed_config_params(db, dry_run=dry_run)
        if not dry_run:
            db.commit()
        print(f"  => {n_config} parámetros insertados")

        # ---------------------------------------------------------------
        # 2. Datos desde Excel Brame
        # ---------------------------------------------------------------
        brame_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "context",
            "BJX_Calculadora_Brame_v1.xlsx",
        )

        brame_stats = {"models": 0, "services": 0,
                       "catalog_entries": 0, "brame_prices_past": 0,
                       "brame_prices_current": 0, "errors": 0}

        print("\n[STEP 2] Carga de Excel Brame...")
        if os.path.exists(brame_path):
            brame_stats = load_brame_excel(db, brame_path, dry_run=dry_run)
            if not dry_run:
                try:
                    db.commit()
                except Exception as exc:
                    print(f"[ERROR] Commit Brame: {exc}")
                    db.rollback()
                    total_errors += 1
            total_errors += brame_stats.get("errors", 0)
        else:
            print(f"  [WARN] No se encontró: {brame_path}")

        # ---------------------------------------------------------------
        # 3. Usuario admin
        # ---------------------------------------------------------------
        print("\n[STEP 3] Seed de usuario admin...")
        seed_admin_user(db, dry_run=dry_run)
        if not dry_run:
            try:
                db.commit()
            except Exception as exc:
                print(f"[ERROR] Commit usuario admin: {exc}")
                db.rollback()
                total_errors += 1

        # ---------------------------------------------------------------
        # 4. Resumen final
        # ---------------------------------------------------------------
        print("\n" + "=" * 60)
        print("RESUMEN DE SEED")
        print("=" * 60)

        if dry_run:
            print(f"  Modelos        : (dry-run, no contabilizado)")
            print(f"  Servicios      : (dry-run, no contabilizado)")
            print(f"  Entradas catálogo: {brame_stats['catalog_entries']}")
            print(f"  Precios Brame actuales: {brame_stats['brame_prices_current']}")
            print(f"  Precios Brame pasados : {brame_stats['brame_prices_past']}")
        else:
            n_models = db.query(VehicleModel).count()
            n_services = db.query(Service).count()
            n_catalog = db.query(ServiceCatalog).count()
            n_brame_current = (
                db.query(SupplierPrice)
                .join(Supplier, SupplierPrice.supplier_id == Supplier.id)
                .filter(Supplier.name.ilike("brame"), SupplierPrice.is_current == True)
                .count()
            )
            n_brame_past = (
                db.query(SupplierPrice)
                .join(Supplier, SupplierPrice.supplier_id == Supplier.id)
                .filter(Supplier.name.ilike("brame"), SupplierPrice.is_current == False)
                .count()
            )
            print(f"  Modelos en DB          : {n_models}")
            print(f"  Servicios en DB        : {n_services}")
            print(f"  Entradas catálogo en DB: {n_catalog}")
            print(f"  Precios Brame actuales : {n_brame_current}")
            print(f"  Precios Brame pasados  : {n_brame_past}")

        print(f"  Errores totales        : {total_errors}")

        if total_errors > 0:
            print(f"\n  [WARN] Se omitieron {total_errors} fila(s) con errores.")

        print("=" * 60)
        print("[OK] Seed completado.")

    except Exception as exc:
        db.rollback()
        print(f"\n[FATAL] Error inesperado: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
