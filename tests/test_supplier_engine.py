import pytest
from pydantic import ValidationError

from app.schemas.engine import ScoringWeights, SupplierOption
from app.services.supplier_engine import SupplierEngine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_supplier(
    supplier_id: str,
    supplier_name: str,
    total_price: float,
    lead_time_days: int,
    warranty_days: int,
    ref_cost: float = 0.0,
    labor_cost: float = 0.0,
) -> SupplierOption:
    return SupplierOption(
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        ref_cost=ref_cost,
        labor_cost=labor_cost,
        total_price=total_price,
        lead_time_days=lead_time_days,
        warranty_days=warranty_days,
    )


DEFAULT_WEIGHTS = ScoringWeights(price_weight=0.50, time_weight=0.30, tc_weight=0.20)

ENGINE = SupplierEngine()


# ---------------------------------------------------------------------------
# Test: lista vacía
# ---------------------------------------------------------------------------

def test_empty_list_returns_empty():
    result = ENGINE.score([], DEFAULT_WEIGHTS)
    assert result == []


# ---------------------------------------------------------------------------
# Test: un solo proveedor
# ---------------------------------------------------------------------------

def test_single_supplier():
    supplier = make_supplier("s1", "Brame", total_price=1000.0, lead_time_days=5, warranty_days=365)
    result = ENGINE.score([supplier], DEFAULT_WEIGHTS)

    assert len(result) == 1
    s = result[0]
    assert s.rank == 1
    assert s.recommended is True
    assert s.final_score == pytest.approx(1.0)
    assert s.normalized_price == pytest.approx(1.0)
    assert s.normalized_time == pytest.approx(1.0)
    assert s.normalized_tc == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# Test: dos proveedores — el más barato/rápido/mayor garantía gana
# ---------------------------------------------------------------------------

def test_two_suppliers_cheaper_faster_wins():
    # s1 es más barato, más rápido y mayor garantía → debe ganar con cualquier peso razonable
    s1 = make_supplier("s1", "Brame", total_price=500.0, lead_time_days=2, warranty_days=730)
    s2 = make_supplier("s2", "DAPESA", total_price=1000.0, lead_time_days=10, warranty_days=180)

    result = ENGINE.score([s1, s2], DEFAULT_WEIGHTS)

    assert len(result) == 2
    winner = result[0]
    loser = result[1]

    assert winner.supplier_id == "s1"
    assert winner.rank == 1
    assert winner.recommended is True

    assert loser.supplier_id == "s2"
    assert loser.rank == 2
    assert loser.recommended is False


def test_two_suppliers_weights_favor_expensive_fast():
    """Con pesos que dan todo el valor a tiempo, el más rápido gana aunque sea más caro."""
    s_cheap_slow = make_supplier("cheap", "CheapCo", total_price=500.0, lead_time_days=30, warranty_days=365)
    s_expensive_fast = make_supplier("fast", "FastCo", total_price=2000.0, lead_time_days=1, warranty_days=365)

    # Peso 100% en tiempo de entrega
    weights = ScoringWeights(price_weight=0.0, time_weight=1.0, tc_weight=0.0)
    result = ENGINE.score([s_cheap_slow, s_expensive_fast], weights)

    assert result[0].supplier_id == "fast"
    assert result[0].recommended is True
    assert result[1].supplier_id == "cheap"
    assert result[1].recommended is False


# ---------------------------------------------------------------------------
# Test: pesos que no suman 1.0 → ValidationError de Pydantic
# ---------------------------------------------------------------------------

def test_invalid_weights_raise_validation_error():
    with pytest.raises(ValidationError):
        ScoringWeights(price_weight=0.50, time_weight=0.30, tc_weight=0.30)


def test_invalid_weights_too_low():
    with pytest.raises(ValidationError):
        ScoringWeights(price_weight=0.10, time_weight=0.10, tc_weight=0.10)


# ---------------------------------------------------------------------------
# Test: precio idéntico en todos → normalized_price=1.0 para todos
# ---------------------------------------------------------------------------

def test_equal_prices_all_normalized_price_one():
    s1 = make_supplier("s1", "Brame", total_price=1000.0, lead_time_days=2, warranty_days=365)
    s2 = make_supplier("s2", "DAPESA", total_price=1000.0, lead_time_days=5, warranty_days=180)
    s3 = make_supplier("s3", "OtherCo", total_price=1000.0, lead_time_days=10, warranty_days=90)

    result = ENGINE.score([s1, s2, s3], DEFAULT_WEIGHTS)

    for s in result:
        assert s.normalized_price == pytest.approx(1.0), (
            f"{s.supplier_id} normalized_price={s.normalized_price}"
        )


# ---------------------------------------------------------------------------
# Test: garantía idéntica en todos → normalized_tc=1.0 para todos
# ---------------------------------------------------------------------------

def test_equal_warranty_all_normalized_tc_one():
    s1 = make_supplier("s1", "Brame", total_price=500.0, lead_time_days=2, warranty_days=365)
    s2 = make_supplier("s2", "DAPESA", total_price=800.0, lead_time_days=7, warranty_days=365)
    s3 = make_supplier("s3", "OtherCo", total_price=1200.0, lead_time_days=14, warranty_days=365)

    result = ENGINE.score([s1, s2, s3], DEFAULT_WEIGHTS)

    for s in result:
        assert s.normalized_tc == pytest.approx(1.0), (
            f"{s.supplier_id} normalized_tc={s.normalized_tc}"
        )


# ---------------------------------------------------------------------------
# Test: solo un recommended=True cuando hay múltiples proveedores
# ---------------------------------------------------------------------------

def test_exactly_one_recommended():
    suppliers = [
        make_supplier("s1", "Alpha", total_price=300.0, lead_time_days=3, warranty_days=365),
        make_supplier("s2", "Beta", total_price=500.0, lead_time_days=5, warranty_days=180),
        make_supplier("s3", "Gamma", total_price=700.0, lead_time_days=7, warranty_days=90),
        make_supplier("s4", "Delta", total_price=900.0, lead_time_days=10, warranty_days=60),
    ]

    result = ENGINE.score(suppliers, DEFAULT_WEIGHTS)

    recommended_count = sum(1 for s in result if s.recommended)
    assert recommended_count == 1
    assert result[0].recommended is True
    for s in result[1:]:
        assert s.recommended is False


# ---------------------------------------------------------------------------
# Test: ranks son consecutivos y únicos
# ---------------------------------------------------------------------------

def test_ranks_are_consecutive():
    suppliers = [
        make_supplier("s1", "Alpha", total_price=300.0, lead_time_days=3, warranty_days=365),
        make_supplier("s2", "Beta", total_price=600.0, lead_time_days=6, warranty_days=180),
        make_supplier("s3", "Gamma", total_price=900.0, lead_time_days=9, warranty_days=90),
    ]

    result = ENGINE.score(suppliers, DEFAULT_WEIGHTS)

    ranks = [s.rank for s in result]
    assert sorted(ranks) == list(range(1, len(suppliers) + 1))


# ---------------------------------------------------------------------------
# Test: normalización min-max correcta con valores conocidos
# ---------------------------------------------------------------------------

def test_normalization_values():
    """Verifica los valores exactos de normalización con dos proveedores."""
    # s1: precio=200, tiempo=2, garantía=365
    # s2: precio=600, tiempo=10, garantía=100
    s1 = make_supplier("s1", "Cheap", total_price=200.0, lead_time_days=2, warranty_days=365)
    s2 = make_supplier("s2", "Expensive", total_price=600.0, lead_time_days=10, warranty_days=100)

    weights = ScoringWeights(price_weight=1/3, time_weight=1/3, tc_weight=1/3)
    result = ENGINE.score([s1, s2], weights)

    # s1 debe ser rank 1
    r1 = next(s for s in result if s.supplier_id == "s1")
    r2 = next(s for s in result if s.supplier_id == "s2")

    # normalized_price de s1 = 1 - (200-200)/(600-200) = 1.0
    assert r1.normalized_price == pytest.approx(1.0)
    # normalized_price de s2 = 1 - (600-200)/(600-200) = 0.0
    assert r2.normalized_price == pytest.approx(0.0)

    # normalized_time de s1 = 1 - (2-2)/(10-2) = 1.0
    assert r1.normalized_time == pytest.approx(1.0)
    # normalized_time de s2 = 1 - (10-2)/(10-2) = 0.0
    assert r2.normalized_time == pytest.approx(0.0)

    # normalized_tc de s1 = (365-100)/(365-100) = 1.0
    assert r1.normalized_tc == pytest.approx(1.0)
    # normalized_tc de s2 = (100-100)/(365-100) = 0.0
    assert r2.normalized_tc == pytest.approx(0.0)
