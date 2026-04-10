"""
Tests para PricingEngine — motor de cálculo puro.

No se usa ninguna fixture de DB: el engine es una función pura
que no realiza I/O de ningún tipo.
"""
import math
import pytest

from app.schemas.engine import CalculationInput
from app.services.pricing_engine import PricingEngine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_input(**kwargs) -> CalculationInput:
    """Construye un CalculationInput con valores base razonables; sobreescribir con kwargs."""
    defaults = dict(
        model_id="model-001",
        service_id="svc-001",
        technician_cost_hr=156.25,
        target_margin=0.40,
        override_duration_hrs=None,
        catalog_labor_cost=None,
        catalog_parts_cost=None,
        catalog_duration_hrs=2.0,
        brame_ref_actual=500.0,
        brame_total_actual=1_000.0,
    )
    defaults.update(kwargs)
    return CalculationInput(**defaults)


engine = PricingEngine()


# ---------------------------------------------------------------------------
# 1. Cálculo normal con datos de catálogo completos → data_source="catalog"
# ---------------------------------------------------------------------------

class TestCatalogDataSource:
    def test_data_source_is_catalog_when_both_catalog_costs_provided(self):
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0)
        result = engine.calculate(inp)
        assert result.data_source == "catalog"

    def test_uses_catalog_labor_cost_directly(self):
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0)
        result = engine.calculate(inp)
        assert result.labor_cost == 300.0

    def test_uses_catalog_parts_cost_directly(self):
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0)
        result = engine.calculate(inp)
        assert result.parts_cost == 400.0

    def test_total_bjx_cost_is_sum_of_labor_and_parts(self):
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0)
        result = engine.calculate(inp)
        assert result.total_bjx_cost == pytest.approx(700.0)

    def test_brame_price_equals_brame_total_actual(self):
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0,
                         brame_total_actual=1_200.0)
        result = engine.calculate(inp)
        assert result.brame_price == 1_200.0

    def test_margin_pesos_and_pct_catalog(self):
        # labor=300, parts=400 → total=700; brame=1200
        # margin_pesos = 500; margin_pct = 500/1200 ≈ 0.4167
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0,
                         brame_total_actual=1_200.0)
        result = engine.calculate(inp)
        assert result.margin_pesos == pytest.approx(500.0)
        assert result.margin_pct == pytest.approx(500.0 / 1_200.0)

    def test_suggested_price_catalog(self):
        # total=700; target=0.40 → suggested = 700 / 0.60 ≈ 1166.67
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0,
                         brame_total_actual=1_200.0)
        result = engine.calculate(inp)
        assert result.suggested_price == pytest.approx(700.0 / 0.60)

    def test_gap_vs_target_catalog(self):
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0,
                         brame_total_actual=1_200.0)
        result = engine.calculate(inp)
        expected_gap = 1_200.0 - (700.0 / 0.60)
        assert result.gap_vs_target == pytest.approx(expected_gap)

    def test_margin_status_ok_catalog(self):
        # margin_pct ≈ 0.4167 >= 0.40 → ok
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0,
                         brame_total_actual=1_200.0)
        result = engine.calculate(inp)
        assert result.margin_status == "ok"


# ---------------------------------------------------------------------------
# 2. Cálculo con proxy (data_source="estimated")
# ---------------------------------------------------------------------------

class TestEstimatedDataSource:
    def test_data_source_estimated_when_no_catalog_costs(self):
        # catalog_labor_cost=None, catalog_parts_cost=None → estimated
        inp = make_input(catalog_duration_hrs=2.0, brame_ref_actual=500.0,
                         brame_total_actual=1_000.0)
        result = engine.calculate(inp)
        assert result.data_source == "estimated"

    def test_data_source_estimated_when_only_labor_cost_missing(self):
        inp = make_input(catalog_labor_cost=None, catalog_parts_cost=400.0)
        result = engine.calculate(inp)
        assert result.data_source == "estimated"

    def test_data_source_estimated_when_only_parts_cost_missing(self):
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=None)
        result = engine.calculate(inp)
        assert result.data_source == "estimated"

    def test_labor_cost_computed_from_duration_and_rate(self):
        # catalog_labor_cost=None → labor = duration_hrs × technician_cost_hr
        # 2.0 × 156.25 = 312.50
        inp = make_input(catalog_duration_hrs=2.0, technician_cost_hr=156.25)
        result = engine.calculate(inp)
        assert result.labor_cost == pytest.approx(2.0 * 156.25)

    def test_parts_cost_falls_back_to_brame_ref_actual(self):
        # catalog_parts_cost=None → parts = brame_ref_actual
        inp = make_input(brame_ref_actual=500.0)
        result = engine.calculate(inp)
        assert result.parts_cost == pytest.approx(500.0)

    def test_full_estimated_calculation(self):
        # labor = 2 × 156.25 = 312.50; parts = 500.0; total = 812.50
        # brame_price = 1000; margin_pesos = 187.50; margin_pct = 0.1875
        inp = make_input(catalog_duration_hrs=2.0, technician_cost_hr=156.25,
                         brame_ref_actual=500.0, brame_total_actual=1_000.0)
        result = engine.calculate(inp)
        assert result.total_bjx_cost == pytest.approx(812.50)
        assert result.margin_pesos == pytest.approx(187.50)
        assert result.margin_pct == pytest.approx(187.50 / 1_000.0)


# ---------------------------------------------------------------------------
# 3. brame_price == 0 → sin excepción, margin_status = "critical"
# ---------------------------------------------------------------------------

class TestBramePriceZero:
    def test_no_zero_division_error(self):
        inp = make_input(brame_total_actual=0.0)
        result = engine.calculate(inp)  # no debe lanzar excepción
        assert result is not None

    def test_margin_pct_is_zero_when_brame_price_zero(self):
        inp = make_input(brame_total_actual=0.0)
        result = engine.calculate(inp)
        assert result.margin_pct == 0.0

    def test_margin_status_critical_when_brame_price_zero(self):
        inp = make_input(brame_total_actual=0.0)
        result = engine.calculate(inp)
        assert result.margin_status == "critical"

    def test_margin_pesos_negative_when_brame_price_zero(self):
        # cost > 0 y brame_price = 0 → margin_pesos < 0
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0,
                         brame_total_actual=0.0)
        result = engine.calculate(inp)
        assert result.margin_pesos < 0


# ---------------------------------------------------------------------------
# 4. margin_pesos negativo → margin_pct negativo, status = "critical"
# ---------------------------------------------------------------------------

class TestNegativeMargin:
    def test_margin_pesos_can_be_negative(self):
        # labor=600, parts=600 → total=1200; brame=1000 → margin=-200
        inp = make_input(catalog_labor_cost=600.0, catalog_parts_cost=600.0,
                         brame_total_actual=1_000.0)
        result = engine.calculate(inp)
        assert result.margin_pesos == pytest.approx(-200.0)

    def test_margin_pct_is_negative_not_truncated(self):
        inp = make_input(catalog_labor_cost=600.0, catalog_parts_cost=600.0,
                         brame_total_actual=1_000.0)
        result = engine.calculate(inp)
        assert result.margin_pct == pytest.approx(-200.0 / 1_000.0)
        assert result.margin_pct < 0  # NO truncado a cero

    def test_margin_status_critical_when_negative(self):
        inp = make_input(catalog_labor_cost=600.0, catalog_parts_cost=600.0,
                         brame_total_actual=1_000.0)
        result = engine.calculate(inp)
        assert result.margin_status == "critical"


# ---------------------------------------------------------------------------
# 5. override_duration_hrs sobreescribe catalog_duration_hrs
# ---------------------------------------------------------------------------

class TestOverrideDuration:
    def test_override_replaces_catalog_duration(self):
        inp = make_input(catalog_duration_hrs=2.0, override_duration_hrs=4.0)
        result = engine.calculate(inp)
        assert result.duration_hrs == 4.0

    def test_labor_cost_uses_override_duration(self):
        # override=4.0; technician=156.25 → labor = 625.0
        inp = make_input(catalog_duration_hrs=2.0, override_duration_hrs=4.0,
                         technician_cost_hr=156.25)
        result = engine.calculate(inp)
        assert result.labor_cost == pytest.approx(4.0 * 156.25)

    def test_catalog_duration_used_when_no_override(self):
        inp = make_input(catalog_duration_hrs=3.5, override_duration_hrs=None)
        result = engine.calculate(inp)
        assert result.duration_hrs == 3.5


# ---------------------------------------------------------------------------
# 6. margin_status: ok / low / critical en cada rango
# ---------------------------------------------------------------------------

class TestMarginStatus:
    def _result_for_margin(self, brame_total: float, total_cost: float,
                           target_margin: float = 0.40):
        """Helper: construye un escenario con margen controlado."""
        inp = make_input(
            catalog_labor_cost=total_cost,
            catalog_parts_cost=0.0,
            brame_total_actual=brame_total,
            target_margin=target_margin,
        )
        return engine.calculate(inp)

    def test_margin_status_ok(self):
        # margin_pct = (1200 - 700) / 1200 ≈ 0.4167 ≥ 0.40
        result = self._result_for_margin(brame_total=1_200.0, total_cost=700.0)
        assert result.margin_status == "ok"

    def test_margin_status_low(self):
        # margin_pct = (1000 - 650) / 1000 = 0.35 → low (0.30 ≤ pct < 0.40)
        result = self._result_for_margin(brame_total=1_000.0, total_cost=650.0)
        assert result.margin_pct == pytest.approx(0.35)
        assert result.margin_status == "low"

    def test_margin_status_critical_below_30(self):
        # margin_pct = (1000 - 800) / 1000 = 0.20 < 0.30 → critical
        result = self._result_for_margin(brame_total=1_000.0, total_cost=800.0)
        assert result.margin_pct == pytest.approx(0.20)
        assert result.margin_status == "critical"

    def test_margin_status_boundary_at_target(self):
        # margin_pct exactamente igual a target_margin → ok
        # brame=1000, cost=600 → pct=0.40
        result = self._result_for_margin(brame_total=1_000.0, total_cost=600.0)
        assert result.margin_pct == pytest.approx(0.40)
        assert result.margin_status == "ok"

    def test_margin_status_boundary_at_30_pct(self):
        # margin_pct exactamente 0.30 → low (>= 0.30 pero < 0.40)
        result = self._result_for_margin(brame_total=1_000.0, total_cost=700.0)
        assert result.margin_pct == pytest.approx(0.30)
        assert result.margin_status == "low"


# ---------------------------------------------------------------------------
# 7. Edge case: target_margin >= 1.0 → suggested_price sin crash
# ---------------------------------------------------------------------------

class TestTargetMarginEdgeCases:
    def test_target_margin_exactly_one_returns_inf(self):
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0,
                         target_margin=1.0)
        result = engine.calculate(inp)
        assert math.isinf(result.suggested_price)

    def test_target_margin_greater_than_one_returns_inf(self):
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0,
                         target_margin=1.5)
        result = engine.calculate(inp)
        assert math.isinf(result.suggested_price)

    def test_no_crash_with_extreme_target_margin(self):
        inp = make_input(catalog_labor_cost=300.0, catalog_parts_cost=400.0,
                         target_margin=99.0)
        result = engine.calculate(inp)  # no debe lanzar excepción
        assert result is not None
