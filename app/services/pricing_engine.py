from app.schemas.engine import CalculationInput, CalculationResult


class PricingEngine:
    """
    Motor de cálculo puro para costos y márgenes de servicios automotrices BJX × Brame.

    IMPORTANTE: Esta clase es una función pura.
    - No realiza ningún I/O (sin DB, sin HTTP, sin archivos).
    - Mismos inputs producen siempre el mismo output.
    - 100% testeable en aislamiento.
    """

    def calculate(self, inp: CalculationInput) -> CalculationResult:
        # --- Duración efectiva ---
        duration_hrs = (
            inp.override_duration_hrs
            if inp.override_duration_hrs is not None
            else inp.catalog_duration_hrs
        )

        # --- Costo de mano de obra ---
        labor_cost = (
            inp.catalog_labor_cost
            if inp.catalog_labor_cost is not None
            else duration_hrs * inp.technician_cost_hr
        )

        # --- Costo de partes/refacciones ---
        parts_cost = (
            inp.catalog_parts_cost
            if inp.catalog_parts_cost is not None
            else inp.brame_ref_actual
        )

        # --- Costo total BJX ---
        total_bjx_cost = labor_cost + parts_cost

        # --- Precio Brame ---
        brame_price = inp.brame_total_actual

        # --- Margen en pesos ---
        margin_pesos = brame_price - total_bjx_cost

        # --- Margen porcentual (sin ZeroDivisionError) ---
        if brame_price == 0:
            margin_pct = 0.0
        else:
            margin_pct = margin_pesos / brame_price

        # --- Precio sugerido (sin crash si target_margin >= 1.0) ---
        denominator = 1.0 - inp.target_margin
        if denominator <= 0:
            suggested_price = float("inf")
        else:
            suggested_price = total_bjx_cost / denominator

        # --- Brecha vs objetivo ---
        gap_vs_target = brame_price - suggested_price

        # --- Estado del margen ---
        if brame_price == 0 or margin_pct < 0.30:
            margin_status = "critical"
        elif margin_pct < inp.target_margin:
            margin_status = "low"
        else:
            margin_status = "ok"

        # --- Fuente de datos ---
        if inp.catalog_labor_cost is not None and inp.catalog_parts_cost is not None:
            data_source = "catalog"
        else:
            data_source = "estimated"

        return CalculationResult(
            duration_hrs=duration_hrs,
            labor_cost=labor_cost,
            parts_cost=parts_cost,
            total_bjx_cost=total_bjx_cost,
            brame_price=brame_price,
            margin_pesos=margin_pesos,
            margin_pct=margin_pct,
            suggested_price=suggested_price,
            gap_vs_target=gap_vs_target,
            margin_status=margin_status,
            data_source=data_source,
        )
