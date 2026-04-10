"""
Integration tests for /config/* endpoints.
"""
import pytest
from app.models.config import ConfigParam


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def seeded_config(db):
    defaults = [
        ConfigParam(key="technician_cost_hr", value="156.25", description="Costo por hora del técnico"),
        ConfigParam(key="target_margin", value="0.40", description="Margen objetivo"),
        ConfigParam(key="scoring_weight_price", value="0.50", description="Peso precio en scoring"),
        ConfigParam(key="scoring_weight_time", value="0.30", description="Peso tiempo en scoring"),
        ConfigParam(key="scoring_weight_tc", value="0.20", description="Peso TC en scoring"),
    ]
    db.add_all(defaults)
    db.commit()
    return defaults


# ---------------------------------------------------------------------------
# TestGetConfig
# ---------------------------------------------------------------------------

class TestGetConfig:
    def test_get_config_authenticated(self, client, admin_token, seeded_config):
        r = client.get("/config", headers={"Authorization": f"Bearer {admin_token}"})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        keys = [item["key"] for item in data]
        assert "technician_cost_hr" in keys
        assert "target_margin" in keys

    def test_get_config_no_auth(self, client, seeded_config):
        r = client.get("/config")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# TestUpdateConfig
# ---------------------------------------------------------------------------

class TestUpdateConfig:
    def test_update_technician_cost(self, client, admin_token, seeded_config):
        r = client.put(
            "/config/technician_cost_hr",
            json={"value": "200.00"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["key"] == "technician_cost_hr"
        assert data["value"] == "200.00"

    def test_update_target_margin(self, client, admin_token, seeded_config):
        r = client.put(
            "/config/target_margin",
            json={"value": "0.35"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        assert r.json()["value"] == "0.35"

    @pytest.mark.parametrize("bad_value", ["1.00", "0.00", "1.5", "-0.1"])
    def test_update_target_margin_invalid(self, client, admin_token, seeded_config, bad_value):
        r = client.put(
            "/config/target_margin",
            json={"value": bad_value},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 422

    def test_update_as_operador_forbidden(self, client, operador_token, seeded_config):
        r = client.put(
            "/config/technician_cost_hr",
            json={"value": "100.00"},
            headers={"Authorization": f"Bearer {operador_token}"},
        )
        assert r.status_code == 403

    def test_update_nonexistent_key(self, client, admin_token, seeded_config):
        r = client.put(
            "/config/nonexistent_key",
            json={"value": "42"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 404

    def test_update_scoring_weights_valid(self, client, admin_token, db):
        # Seed tc=0.00 so that updating tc=0.20 completes the sum: 0.50+0.30+0.20=1.0
        # (Each update is validated independently; intermediate states must also sum to 1.0)
        from app.models.config import ConfigParam
        params = [
            ConfigParam(key="scoring_weight_price", value="0.50", description="test"),
            ConfigParam(key="scoring_weight_time", value="0.30", description="test"),
            ConfigParam(key="scoring_weight_tc", value="0.00", description="test"),
        ]
        db.add_all(params)
        db.commit()

        r = client.put(
            "/config/scoring_weight_tc",
            json={"value": "0.20"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        assert r.json()["value"] == "0.20"

    def test_update_scoring_weight_breaks_sum(self, client, admin_token, seeded_config):
        # price=0.50, time=0.30, tc=0.20 → updating price to 0.70 → sum=1.20 → 422
        r = client.put(
            "/config/scoring_weight_price",
            json={"value": "0.70"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# TestConfigHistory
# ---------------------------------------------------------------------------

class TestConfigHistory:
    def test_history_records_change(self, client, admin_token, seeded_config):
        # Perform one update
        client.put(
            "/config/technician_cost_hr",
            json={"value": "175.00"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

        # Fetch history
        r = client.get(
            "/config/history/technician_cost_hr",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200
        history = r.json()
        assert len(history) >= 1
        latest = history[0]
        assert latest["key"] == "technician_cost_hr"
        assert latest["old_value"] == "156.25"
        assert latest["new_value"] == "175.00"
        assert latest["changed_by"] == "admin@test.com"

    def test_history_nonexistent_key(self, client, admin_token, seeded_config):
        r = client.get(
            "/config/history/does_not_exist",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 404
