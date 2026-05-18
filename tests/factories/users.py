"""Factories for User and MechanicProfile."""
from __future__ import annotations

import factory
from factory.alchemy import SQLAlchemyModelFactory
from faker import Faker

from app.models.users import User

fake = Faker("es_MX")


class UserFactory(SQLAlchemyModelFactory):
    class Meta:
        model = User
        sqlalchemy_session_persistence = "flush"

    email = factory.LazyAttribute(lambda _: fake.unique.email())
    hashed_password = "$2b$12$fake-hash-for-tests"
    role = "viewer"
    active = True
    default_branch_id = None
