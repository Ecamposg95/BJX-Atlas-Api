from app.schemas.engine import SupplierOption, ScoredSupplier, ScoringWeights


class SupplierEngine:
    def score(
        self,
        suppliers: list[SupplierOption],
        weights: ScoringWeights,
    ) -> list[ScoredSupplier]:
        """
        Normalización min-max ponderada. Retorna lista ordenada por rank (1=mejor).
        """
        if not suppliers:
            return []

        prices = [s.total_price for s in suppliers]
        times = [s.lead_time_days for s in suppliers]
        warranties = [s.warranty_days for s in suppliers]

        min_price, max_price = min(prices), max(prices)
        min_time, max_time = min(times), max(times)
        min_warranty, max_warranty = min(warranties), max(warranties)

        scored: list[ScoredSupplier] = []

        for s in suppliers:
            # normalized_price: menor precio = mayor score (invertido)
            if max_price == min_price:
                normalized_price = 1.0
            else:
                normalized_price = 1.0 - (s.total_price - min_price) / (max_price - min_price)

            # normalized_time: menor tiempo = mayor score (invertido)
            if max_time == min_time:
                normalized_time = 1.0
            else:
                normalized_time = 1.0 - (s.lead_time_days - min_time) / (max_time - min_time)

            # normalized_tc: mayor garantía = mayor score (directo)
            if max_warranty == min_warranty:
                normalized_tc = 1.0
            else:
                normalized_tc = (s.warranty_days - min_warranty) / (max_warranty - min_warranty)

            final_score = (
                normalized_price * weights.price_weight
                + normalized_time * weights.time_weight
                + normalized_tc * weights.tc_weight
            )

            scored.append(
                ScoredSupplier(
                    **s.model_dump(),
                    normalized_price=normalized_price,
                    normalized_time=normalized_time,
                    normalized_tc=normalized_tc,
                    final_score=final_score,
                    rank=0,           # se asigna después de ordenar
                    recommended=False,
                )
            )

        # Ordenar por final_score DESC y asignar rank
        scored.sort(key=lambda x: x.final_score, reverse=True)

        result: list[ScoredSupplier] = []
        for i, supplier in enumerate(scored):
            result.append(
                supplier.model_copy(
                    update={
                        "rank": i + 1,
                        "recommended": i == 0,
                    }
                )
            )

        return result
