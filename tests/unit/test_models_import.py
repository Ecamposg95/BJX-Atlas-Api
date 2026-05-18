"""Smoke test: modelos nuevos importables."""


def test_workshop_history_importable():
    from app.models.workshop_history import WorkOrderStatusHistory
    assert WorkOrderStatusHistory.__tablename__ == "work_order_status_history"


def test_mechanic_profile_importable():
    from app.models.mechanic_profiles import (
        LEVEL_ORDER,
        MechanicLevel,
        MechanicProfile,
        MechanicSkill,
        SkillCategory,
    )
    assert MechanicProfile.__tablename__ == "mechanic_profiles"
    assert MechanicSkill.__tablename__ == "mechanic_skills"
    assert MechanicLevel.junior.value == "junior"
    assert SkillCategory.frenos.value == "frenos"
    assert LEVEL_ORDER["master"] == 3


def test_assignments_importable():
    from app.models.assignments import Assignment, AssignmentStatus
    assert Assignment.__tablename__ == "assignments"
    assert AssignmentStatus.active.value == "active"
    assert AssignmentStatus.reassigned.value == "reassigned"


def test_findings_importable():
    from app.models.findings import FindingStatus, WorkOrderFinding
    assert WorkOrderFinding.__tablename__ == "work_order_findings"
    assert FindingStatus.pending.value == "pending"


def test_idempotency_importable():
    from app.models.idempotency import IdempotencyKey
    assert IdempotencyKey.__tablename__ == "idempotency_keys"


def test_work_order_type_enum_added():
    from app.models.work_orders import WorkOrderStatus, WorkOrderType

    assert WorkOrderType.appointment.value == "appointment"
    assert WorkOrderType.tow.value == "tow"
    assert WorkOrderType.standby.value == "standby"
    assert WorkOrderStatus.assigned.value == "assigned"
    assert WorkOrderStatus.cancelled.value == "cancelled"
    assert WorkOrderStatus.quality_check.value == "quality_check"


def test_service_required_level_added():
    from app.models.catalog import ServiceRequiredLevel

    assert ServiceRequiredLevel.junior.value == "junior"
    assert ServiceRequiredLevel.master.value == "master"
