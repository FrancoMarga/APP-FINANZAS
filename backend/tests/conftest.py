"""Shared fixtures: seed test users/sessions directly in MongoDB and provide auth clients."""
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

# Load backend env
BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(BACKEND_ENV)

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ENCRYPTION_KEY = os.environ["ENCRYPTION_KEY"]

# Public URL for HTTP calls
FRONTEND_ENV = Path(__file__).resolve().parents[2] / "frontend" / ".env"
_pub = None
for line in FRONTEND_ENV.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL"):
        _pub = line.split("=", 1)[1].strip().strip('"')
        break
BASE_URL = _pub.rstrip("/")


def _make_user(prefix: str):
    """Directly seed a user + session in Mongo. Returns (user_id, token)."""
    mc = MongoClient(MONGO_URL)
    db = mc[DB_NAME]
    uid = f"user_TEST_{prefix}_{uuid.uuid4().hex[:8]}"
    token = f"TEST_token_{prefix}_{uuid.uuid4().hex[:12]}"
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:6]}@example.com"
    now = datetime.now(timezone.utc)
    db.users.insert_one({
        "user_id": uid,
        "email": email,
        "name": f"TEST User {prefix}",
        "created_at": now,
    })
    db.user_sessions.insert_one({
        "session_token": token,
        "user_id": uid,
        "email": email,
        "name": f"TEST User {prefix}",
        "expires_at": now + timedelta(days=1),
        "created_at": now,
    })
    # Seed default categories (mirror server logic)
    default_cats = [
        {"name": "Comida", "type": "expense", "icon": "restaurant", "color": "#F87171"},
        {"name": "Transporte", "type": "expense", "icon": "car", "color": "#FBBF24"},
        {"name": "Vivienda", "type": "expense", "icon": "home", "color": "#A78BFA"},
        {"name": "Entretenimiento", "type": "expense", "icon": "game-controller", "color": "#F472B6"},
        {"name": "Salud", "type": "expense", "icon": "medkit", "color": "#4ADE80"},
        {"name": "Educación", "type": "expense", "icon": "school", "color": "#60A5FA"},
        {"name": "Compras", "type": "expense", "icon": "cart", "color": "#FB923C"},
        {"name": "Servicios", "type": "expense", "icon": "construct", "color": "#818CF8"},
        {"name": "Otros Gastos", "type": "expense", "icon": "ellipsis-horizontal", "color": "#9CA3AF"},
        {"name": "Salario", "type": "income", "icon": "cash", "color": "#4ADE80"},
        {"name": "Freelance", "type": "income", "icon": "laptop", "color": "#60A5FA"},
        {"name": "Inversiones", "type": "income", "icon": "trending-up", "color": "#A78BFA"},
        {"name": "Otros Ingresos", "type": "income", "icon": "add-circle", "color": "#4ADE80"},
    ]
    docs = [{**c, "user_id": uid, "is_custom": False, "category_id": f"cat_{uuid.uuid4().hex[:12]}"}
            for c in default_cats]
    db.categories.insert_many(docs)
    mc.close()
    return uid, token, email


def _cleanup(user_id):
    mc = MongoClient(MONGO_URL)
    db = mc[DB_NAME]
    db.transactions.delete_many({"user_id": user_id})
    db.investments.delete_many({"user_id": user_id})
    db.budgets.delete_many({"user_id": user_id})
    db.categories.delete_many({"user_id": user_id})
    db.user_sessions.delete_many({"user_id": user_id})
    db.users.delete_many({"user_id": user_id})
    mc.close()


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def user1():
    uid, token, email = _make_user("u1")
    yield {"user_id": uid, "token": token, "email": email}
    _cleanup(uid)


@pytest.fixture(scope="session")
def user2():
    uid, token, email = _make_user("u2")
    yield {"user_id": uid, "token": token, "email": email}
    _cleanup(uid)


@pytest.fixture(scope="session")
def client1(user1):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {user1['token']}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="session")
def client2(user2):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {user2['token']}",
        "Content-Type": "application/json",
    })
    return s


@pytest.fixture(scope="session")
def mongo_db():
    mc = MongoClient(MONGO_URL)
    yield mc[DB_NAME]
    mc.close()


@pytest.fixture(scope="session")
def encryption_key():
    return ENCRYPTION_KEY
