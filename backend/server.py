from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Any, Dict
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from cryptography.fernet import Fernet
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
import httpx
import uuid
import base64
import json
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Encryption setup
ENCRYPTION_KEY = os.environ['ENCRYPTION_KEY'].encode()
cipher = Fernet(ENCRYPTION_KEY)


def encrypt_field(value: Any) -> str:
    """Encrypt a field value (string or number) for at-rest storage"""
    if value is None:
        return None
    return cipher.encrypt(json.dumps(value).encode()).decode()


def decrypt_field(value: str) -> Any:
    """Decrypt a field value"""
    if value is None:
        return None
    try:
        return json.loads(cipher.decrypt(value.encode()).decode())
    except Exception:
        return value


# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")


# ==================== MODELS ====================

class UserSession(BaseModel):
    session_token: str
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionAuthRequest(BaseModel):
    session_id: str


class CategoryCreate(BaseModel):
    name: str
    type: Literal['expense', 'income', 'investment']
    icon: str = "wallet"
    color: str = "#D4F542"


class TransactionCreate(BaseModel):
    type: Literal['expense', 'income', 'saving']
    amount: float
    category: str
    description: str = ""
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    goal_id: Optional[str] = None  # si type=saving, a qué meta de ahorro aporta (opcional)


class RecurringCreate(BaseModel):
    type: Literal['expense', 'income', 'saving']
    amount: float
    category: str
    description: str = ""
    day_of_month: int = 1  # día del mes en que se genera (1-28)


class SavingsGoalCreate(BaseModel):
    name: str
    target_amount: float
    deadline: Optional[datetime] = None
    color: str = "#4ADE80"
    icon: str = "flag"
    photo: Optional[str] = None  # imagen en base64 (data URI), opcional


class SavingsContributionCreate(BaseModel):
    amount: float  # positivo = aporte, negativo = retiro
    note: str = ""
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LoanCreate(BaseModel):
    person_name: str
    description: str = ""
    amount: float  # monto prestado (capital)
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    monthly_interest_rate: Optional[float] = None  # % mensual, opcional (ej: 5 = 5%/mes)


class LoanPaymentCreate(BaseModel):
    amount: float
    note: str = ""
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BudgetCreate(BaseModel):
    category: str
    monthly_limit: float
    alert_threshold: float = 80.0
    month: str
    recurring: bool = False


class InvestmentCreate(BaseModel):
    name: str
    type: Literal['crypto', 'stock', 'other']
    quantity: float
    purchase_price: float
    current_price: float
    coin_id: Optional[str] = None  # CoinGecko ID for auto-sync
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CreditCardCreate(BaseModel):
    name: str
    bank: Optional[str] = None
    last_digits: Optional[str] = None
    color: str = "#A78BFA"
    closing_day: int = 1  # día del mes en que cierra el resumen
    payment_due_day: int = 10  # día del mes en que vence el pago del resumen (después del cierre)


class CardExpenseCreate(BaseModel):
    card_id: str
    description: str
    category: Optional[str] = None
    total_amount: float  # si currency='USD', esto es el monto en DÓLARES (no en pesos)
    installments: int = 1  # 1 = pago único / contado
    purchase_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Si está tildado (default), al pagar el resumen esta compra se suma a
    # la torta de gastos del dashboard, bajo la categoría "Tarjeta".
    include_in_summary: bool = True
    currency: Literal['ARS', 'USD'] = 'ARS'
    # Cotización del dólar blue a usar para convertir a pesos (si no se
    # manda y currency='USD', se toma la cotización actual del momento).
    fx_rate: Optional[float] = None
    # Gasto fijo que se repite todos los meses con el mismo monto (ej: una
    # suscripción) — no tiene cuotas, se regenera solo cada ciclo.
    is_fixed_monthly: bool = False


class CardPaymentCreate(BaseModel):
    amount_paid: float  # cuánto pagaste de este resumen (puede ser parcial)
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


SUPER_ACCOUNT_CATEGORY = "Cuenta Super"
SUPER_ACCOUNT_MIGRATION_CUTOFF = datetime(2026, 9, 1, tzinfo=timezone.utc)  # agosto y anteriores no se tocan


class SuperExpenseCreate(BaseModel):
    description: str
    amount: float
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SuperPaymentCreate(BaseModel):
    amount_paid: float  # lo que abonás vos (ej: 300000)
    reimbursement: float = 0.0  # lo que te reintegran por promo (ej: 90000)
    cycle: Optional[str] = None  # mes puntual a pagar ("2026-08"); si no se manda, es el mes actual
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ==================== AUTHENTICATION ====================

async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and validate user from Authorization: Bearer <token> header"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.replace("Bearer ", "").strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})

    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    # Normalize datetime
    expires = session['expires_at']
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if expires < datetime.now(timezone.utc):
        await db.user_sessions.delete_one({"session_token": token})
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session['user_id']}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user

async def upsert_user_and_create_session(email: str, name: str, picture: Optional[str], session_token: Optional[str] = None):
    """Crea o actualiza el usuario por email, y crea su sesión. Devuelve el payload de respuesta."""
    if not session_token:
        session_token = uuid.uuid4().hex
 
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user['user_id']
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc),
        })
        await initialize_user_categories(user_id)
 
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"user_id": user_id},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True
    )
 
    return {
        "session_token": session_token,
        "user": {"user_id": user_id, "email": email, "name": name, "picture": picture}
    }
 
 
@api_router.post("/auth/session")
async def create_session(request: SessionAuthRequest):
    """Exchange session_id from Emergent auth for a session_token"""
    async with httpx.AsyncClient() as http:
        response = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": request.session_id},
            timeout=10.0
        )
 
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
 
        data = response.json()
 
    return await upsert_user_and_create_session(
        email=data['email'], name=data['name'], picture=data.get('picture'),
        session_token=data['session_token'],
    )
 
 
class GoogleAuthRequest(BaseModel):
    id_token: str


@api_router.post("/auth/google")
async def google_login(request: GoogleAuthRequest):
    """
    Login con Google usando el SDK nativo (@react-native-google-signin).
    Recibe el idToken firmado por Google y lo verifica directamente,
    sin necesidad de redirect_uri ni intercambio de código.
    """
    web_client_id = os.environ.get("GOOGLE_WEB_CLIENT_ID")
    if not web_client_id:
        raise HTTPException(status_code=500, detail="Google client no configurado en el servidor")

    try:
        idinfo = google_id_token.verify_oauth2_token(
            request.id_token,
            google_requests.Request(),
            web_client_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Token de Google inválido: {str(e)}")

    return await upsert_user_and_create_session(
        email=idinfo['email'], name=idinfo.get('name', idinfo['email']), picture=idinfo.get('picture'),
    ) 
 
@api_router.post("/auth/dev-login")
async def dev_login():
    """
    ⚠️ SOLO DESARROLLO — NO USAR EN PRODUCCIÓN ⚠️
    Crea/reutiliza una sesión de prueba sin pasar por Google.
    Solo funciona si la variable de entorno DEV_MODE=true está seteada
    explícitamente en el backend. Si DEV_MODE no está o es distinto de
    "true", este endpoint devuelve 404 como si no existiera.
 
    ANTES DE COMPARTIR EL APK O SUBIR A PRODUCCIÓN:
    1. Borrar este endpoint completo (o dejar DEV_MODE sin setear).
    2. Borrar el botón correspondiente en el frontend (login.tsx / AuthContext).
    """
    if os.environ.get("DEV_MODE", "").lower() != "true":
        raise HTTPException(status_code=404, detail="Not found")
 
    return await upsert_user_and_create_session(
        email="dev@local.test", name="Dev User", picture=None,
        session_token=f"dev_{uuid.uuid4().hex}",
    )

@api_router.get("/auth/me")
async def get_me(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    return user


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"message": "Logged out"}


# ==================== DEFAULT CATEGORIES ====================

DEFAULT_CATEGORIES = [
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


async def initialize_user_categories(user_id: str):
    """Create default categories for a new user"""
    docs = [
        {**cat, "user_id": user_id, "is_custom": False, "category_id": f"cat_{uuid.uuid4().hex[:12]}"}
        for cat in DEFAULT_CATEGORIES
    ]
    await db.categories.insert_many(docs)


# ==================== HELPER FUNCTIONS ====================

def serialize_transaction(doc):
    """Decrypt and serialize a transaction document"""
    return {
        "id": doc['transaction_id'],
        "type": doc['type'],
        "amount": decrypt_field(doc['amount_enc']),
        "category": doc['category'],
        "description": decrypt_field(doc.get('description_enc', encrypt_field(""))),
        "date": doc['date'].isoformat() if isinstance(doc['date'], datetime) else doc['date'],
        "is_recurring": bool(doc.get('recurring_id')),
        "goal_id": doc.get('goal_id'),
    }


def serialize_investment(doc):
    """Decrypt and serialize an investment document"""
    return {
        "id": doc['investment_id'],
        "name": doc['name'],
        "type": doc['type'],
        "quantity": decrypt_field(doc['quantity_enc']),
        "purchase_price": decrypt_field(doc['purchase_price_enc']),
        "current_price": decrypt_field(doc['current_price_enc']),
        "coin_id": doc.get('coin_id'),
        "date": doc['date'].isoformat() if isinstance(doc['date'], datetime) else doc['date'],
    }


def serialize_budget(doc):
    """Decrypt and serialize a budget document"""
    return {
        "id": doc['budget_id'],
        "category": doc['category'],
        "monthly_limit": decrypt_field(doc['monthly_limit_enc']),
        "current_spent": decrypt_field(doc.get('current_spent_enc', encrypt_field(0.0))),
        "alert_threshold": doc.get('alert_threshold', 80.0),
        "month": doc['month'],
        "recurring": doc.get('recurring', False),
    }


async def recompute_budget_spent(user_id: str, category: str, month: str):
    """Recompute current_spent for a budget by summing user's transactions in that month"""
    budget = await db.budgets.find_one({"user_id": user_id, "category": category, "month": month})
    if not budget:
        return

    year, mo = month.split('-')
    start_date = datetime(int(year), int(mo), 1, tzinfo=timezone.utc)
    if int(mo) == 12:
        end_date = datetime(int(year) + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(int(year), int(mo) + 1, 1, tzinfo=timezone.utc)

    expenses = await db.transactions.find({
        "user_id": user_id,
        "type": "expense",
        "category": category,
        "date": {"$gte": start_date, "$lt": end_date}
    }).to_list(10000)

    total = sum(decrypt_field(e['amount_enc']) for e in expenses)
    await db.budgets.update_one(
        {"user_id": user_id, "category": category, "month": month},
        {"$set": {"current_spent_enc": encrypt_field(total)}}
    )


# ==================== CATEGORY ROUTES ====================

@api_router.get("/categories")
async def get_categories(type: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    query = {"user_id": user['user_id']}
    if type:
        query['type'] = type
    categories = await db.categories.find(query, {"_id": 0}).to_list(1000)
    return categories


@api_router.post("/categories")
async def create_category(category: CategoryCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = {
        "category_id": f"cat_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "name": category.name,
        "type": category.type,
        "icon": category.icon,
        "color": category.color,
        "is_custom": True,
    }
    await db.categories.insert_one(doc)
    doc.pop('_id', None)
    return doc


@api_router.put("/categories/{category_id}")
async def update_category(category_id: str, category: CategoryCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    result = await db.categories.update_one(
        {"category_id": category_id, "user_id": user['user_id']},
        {"$set": {
            "name": category.name,
            "type": category.type,
            "icon": category.icon,
            "color": category.color,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    updated = await db.categories.find_one({"category_id": category_id}, {"_id": 0})
    return updated


@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    result = await db.categories.delete_one({"category_id": category_id, "user_id": user['user_id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}


# ==================== TRANSACTION ROUTES ====================

async def generate_due_recurring(user_id: str):
    """
    Genera las transacciones de este mes para cada recurrente activo que
    todavía no se haya generado (comparando contra last_generated_month).
    No usa un cron externo: se llama cada vez que el usuario abre la app
    (en /transactions y /dashboard), así que se ponen al día solas apenas
    el usuario entra después del día correspondiente.
    """
    now = datetime.now(timezone.utc)
    current_month = now.strftime('%Y-%m')
    recurrings = await db.recurring_transactions.find(
        {"user_id": user_id, "active": True}
    ).to_list(200)

    for r in recurrings:
        if r.get('last_generated_month') == current_month:
            continue
        day_of_month = min(r.get('day_of_month', 1), 28)
        if now.day < day_of_month:
            continue

        txn_date = now.replace(day=day_of_month, hour=12, minute=0, second=0, microsecond=0)
        doc = {
            "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "type": r['type'],
            "amount_enc": r['amount_enc'],
            "category": r['category'],
            "description_enc": r.get('description_enc', encrypt_field("")),
            "date": txn_date,
            "created_at": now,
            "recurring_id": r['recurring_id'],
        }
        await db.transactions.insert_one(doc)

        if r['type'] == 'expense':
            await recompute_budget_spent(user_id, r['category'], current_month)

        await db.recurring_transactions.update_one(
            {"recurring_id": r['recurring_id']},
            {"$set": {"last_generated_month": current_month}}
        )


@api_router.get("/transactions")
async def get_transactions(
    type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    month: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    user = await get_current_user(authorization)
    await generate_due_recurring(user['user_id'])
    query = {"user_id": user['user_id']}
    if type:
        query['type'] = type

    if month:
        year, mo = month.split('-')
        sd = datetime(int(year), int(mo), 1, tzinfo=timezone.utc)
        ed = datetime(int(year) + 1, 1, 1, tzinfo=timezone.utc) if int(mo) == 12 else datetime(int(year), int(mo) + 1, 1, tzinfo=timezone.utc)
        query['date'] = {"$gte": sd, "$lt": ed}
    elif start_date and end_date:
        query['date'] = {
            "$gte": datetime.fromisoformat(start_date.replace('Z', '+00:00')),
            "$lte": datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        }

    transactions = await db.transactions.find(query).sort('date', -1).to_list(10000)
    return [serialize_transaction(t) for t in transactions]


@api_router.post("/transactions")
async def create_transaction(transaction: TransactionCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    txn_date = transaction.date
    if txn_date.tzinfo is None:
        txn_date = txn_date.replace(tzinfo=timezone.utc)

    doc = {
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "type": transaction.type,
        "amount_enc": encrypt_field(transaction.amount),
        "category": transaction.category,
        "description_enc": encrypt_field(transaction.description),
        "date": txn_date,
        "created_at": datetime.now(timezone.utc),
        "goal_id": transaction.goal_id if transaction.type == 'saving' else None,
    }
    await db.transactions.insert_one(doc)

    # Auto-update budget if expense
    if transaction.type == 'expense':
        month = txn_date.strftime('%Y-%m')
        await recompute_budget_spent(user['user_id'], transaction.category, month)

    # Si es un ahorro con meta asignada, también queda como aporte a esa meta
    if transaction.type == 'saving' and transaction.goal_id:
        await _link_transaction_to_goal(user['user_id'], doc['transaction_id'], transaction.goal_id, transaction.amount, transaction.description, txn_date)

    doc.pop('_id', None)
    return serialize_transaction(doc)


@api_router.put("/transactions/{transaction_id}")
async def update_transaction(transaction_id: str, transaction: TransactionCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    # Get old transaction for budget recomputation
    old = await db.transactions.find_one({"transaction_id": transaction_id, "user_id": user['user_id']})
    if not old:
        raise HTTPException(status_code=404, detail="Transaction not found")

    txn_date = transaction.date
    if txn_date.tzinfo is None:
        txn_date = txn_date.replace(tzinfo=timezone.utc)

    await db.transactions.update_one(
        {"transaction_id": transaction_id, "user_id": user['user_id']},
        {"$set": {
            "type": transaction.type,
            "amount_enc": encrypt_field(transaction.amount),
            "category": transaction.category,
            "description_enc": encrypt_field(transaction.description),
            "date": txn_date,
            "goal_id": transaction.goal_id if transaction.type == 'saving' else None,
        }}
    )

    # Si ya tenía un aporte vinculado a una meta, lo sacamos y lo volvemos a
    # crear con los datos nuevos (más simple y confiable que tratar de
    # "editar" el aporte existente).
    await _unlink_transaction_from_goal(user['user_id'], transaction_id)
    if transaction.type == 'saving' and transaction.goal_id:
        await _link_transaction_to_goal(user['user_id'], transaction_id, transaction.goal_id, transaction.amount, transaction.description, txn_date)

    # Recompute affected budgets (old and new)
    old_date = old['date'] if isinstance(old['date'], datetime) else datetime.fromisoformat(old['date'])
    if old_date.tzinfo is None:
        old_date = old_date.replace(tzinfo=timezone.utc)

    if old['type'] == 'expense':
        await recompute_budget_spent(user['user_id'], old['category'], old_date.strftime('%Y-%m'))
    if transaction.type == 'expense':
        await recompute_budget_spent(user['user_id'], transaction.category, txn_date.strftime('%Y-%m'))

    updated = await db.transactions.find_one({"transaction_id": transaction_id})
    return serialize_transaction(updated)


@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    old = await db.transactions.find_one({"transaction_id": transaction_id, "user_id": user['user_id']})
    if not old:
        raise HTTPException(status_code=404, detail="Transaction not found")

    await db.transactions.delete_one({"transaction_id": transaction_id, "user_id": user['user_id']})
    await _unlink_transaction_from_goal(user['user_id'], transaction_id)

    # Recompute budget if it was an expense
    if old['type'] == 'expense':
        old_date = old['date'] if isinstance(old['date'], datetime) else datetime.fromisoformat(old['date'])
        if old_date.tzinfo is None:
            old_date = old_date.replace(tzinfo=timezone.utc)
        await recompute_budget_spent(user['user_id'], old['category'], old_date.strftime('%Y-%m'))

    return {"message": "Transaction deleted"}


# ==================== RECURRING TRANSACTIONS ====================

def serialize_recurring(doc):
    return {
        "id": doc['recurring_id'],
        "type": doc['type'],
        "amount": decrypt_field(doc['amount_enc']),
        "category": doc['category'],
        "description": decrypt_field(doc.get('description_enc', encrypt_field(""))),
        "day_of_month": doc.get('day_of_month', 1),
        "active": doc.get('active', True),
        "last_generated_month": doc.get('last_generated_month'),
    }


@api_router.get("/recurring")
async def get_recurring(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    await generate_due_recurring(user['user_id'])
    items = await db.recurring_transactions.find({"user_id": user['user_id']}).to_list(200)
    return [serialize_recurring(r) for r in items]


@api_router.post("/recurring")
async def create_recurring(recurring: RecurringCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = {
        "recurring_id": f"rec_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "type": recurring.type,
        "amount_enc": encrypt_field(recurring.amount),
        "category": recurring.category,
        "description_enc": encrypt_field(recurring.description),
        "day_of_month": max(1, min(28, recurring.day_of_month)),
        "active": True,
        "last_generated_month": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.recurring_transactions.insert_one(doc)
    doc.pop('_id', None)
    return serialize_recurring(doc)


@api_router.put("/recurring/{recurring_id}")
async def update_recurring(recurring_id: str, recurring: RecurringCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    result = await db.recurring_transactions.update_one(
        {"recurring_id": recurring_id, "user_id": user['user_id']},
        {"$set": {
            "type": recurring.type,
            "amount_enc": encrypt_field(recurring.amount),
            "category": recurring.category,
            "description_enc": encrypt_field(recurring.description),
            "day_of_month": max(1, min(28, recurring.day_of_month)),
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Recurring not found")
    updated = await db.recurring_transactions.find_one({"recurring_id": recurring_id})
    return serialize_recurring(updated)


@api_router.post("/recurring/{recurring_id}/toggle")
async def toggle_recurring(recurring_id: str, authorization: Optional[str] = Header(None)):
    """Pausar o reactivar un recurrente (no genera transacciones nuevas mientras está pausado)."""
    user = await get_current_user(authorization)
    current = await db.recurring_transactions.find_one({"recurring_id": recurring_id, "user_id": user['user_id']})
    if not current:
        raise HTTPException(status_code=404, detail="Recurring not found")
    new_active = not current.get('active', True)
    await db.recurring_transactions.update_one(
        {"recurring_id": recurring_id},
        {"$set": {"active": new_active}}
    )
    updated = await db.recurring_transactions.find_one({"recurring_id": recurring_id})
    return serialize_recurring(updated)


@api_router.delete("/recurring/{recurring_id}")
async def delete_recurring(recurring_id: str, authorization: Optional[str] = Header(None)):
    """
    Elimina la regla del recurrente. Las transacciones ya generadas en el
    pasado NO se borran (quedan como movimientos normales del historial).
    """
    user = await get_current_user(authorization)
    result = await db.recurring_transactions.delete_one({"recurring_id": recurring_id, "user_id": user['user_id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Recurring not found")
    return {"message": "Recurring deleted"}


# ==================== BUDGET ROUTES ====================

async def _ensure_recurring_budgets_for_month(user_id: str, month: str):
    """
    Si tenés un presupuesto marcado como "repetir todos los meses", se
    replica solo (misma categoría, mismo límite, misma alerta) al mes que
    estés consultando, en vez de tener que crearlo de nuevo cada vez. Se
    toma el presupuesto recurrente MÁS RECIENTE de cada categoría (por si
    en algún momento le cambiaste el límite), y solo se copia si todavía
    no existe un presupuesto para esa categoría en el mes pedido.
    """
    recurring_docs = await db.budgets.find({"user_id": user_id, "recurring": True}).sort('month', -1).to_list(1000)
    latest_by_category: Dict[str, dict] = {}
    for doc in recurring_docs:
        if doc['category'] not in latest_by_category:
            latest_by_category[doc['category']] = doc

    for category, doc in latest_by_category.items():
        if doc['month'] >= month:
            continue  # no copiar hacia atrás ni sobre sí mismo
        existing = await db.budgets.find_one({"user_id": user_id, "category": category, "month": month})
        if existing:
            continue
        new_doc = {
            "budget_id": f"bgt_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "category": category,
            "monthly_limit_enc": doc['monthly_limit_enc'],
            "current_spent_enc": encrypt_field(0.0),
            "alert_threshold": doc.get('alert_threshold', 80.0),
            "month": month,
            "recurring": True,
        }
        await db.budgets.insert_one(new_doc)
        await recompute_budget_spent(user_id, category, month)


@api_router.get("/budgets")
async def get_budgets(month: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    target_month = month or datetime.now(timezone.utc).strftime('%Y-%m')
    await _ensure_recurring_budgets_for_month(user['user_id'], target_month)
    budgets = await db.budgets.find({"user_id": user['user_id'], "month": target_month}).to_list(1000)
    return [serialize_budget(b) for b in budgets]


@api_router.post("/budgets")
async def create_budget(budget: BudgetCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    existing = await db.budgets.find_one({
        "user_id": user['user_id'],
        "category": budget.category,
        "month": budget.month
    })
    if existing:
        raise HTTPException(status_code=400, detail="Budget already exists")

    doc = {
        "budget_id": f"bgt_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "category": budget.category,
        "monthly_limit_enc": encrypt_field(budget.monthly_limit),
        "current_spent_enc": encrypt_field(0.0),
        "alert_threshold": budget.alert_threshold,
        "month": budget.month,
        "recurring": budget.recurring,
    }
    await db.budgets.insert_one(doc)
    # Recompute current_spent from existing transactions
    await recompute_budget_spent(user['user_id'], budget.category, budget.month)
    updated = await db.budgets.find_one({"budget_id": doc['budget_id']})
    return serialize_budget(updated)


@api_router.put("/budgets/{budget_id}")
async def update_budget(budget_id: str, budget: BudgetCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    result = await db.budgets.update_one(
        {"budget_id": budget_id, "user_id": user['user_id']},
        {"$set": {
            "category": budget.category,
            "monthly_limit_enc": encrypt_field(budget.monthly_limit),
            "alert_threshold": budget.alert_threshold,
            "month": budget.month,
            "recurring": budget.recurring,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    await recompute_budget_spent(user['user_id'], budget.category, budget.month)
    updated = await db.budgets.find_one({"budget_id": budget_id})
    return serialize_budget(updated)


@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    result = await db.budgets.delete_one({"budget_id": budget_id, "user_id": user['user_id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"message": "Budget deleted"}


@api_router.get("/budgets/alerts")
async def get_budget_alerts(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    month = datetime.now(timezone.utc).strftime('%Y-%m')
    budgets = await db.budgets.find({"user_id": user['user_id'], "month": month}).to_list(1000)
    alerts = []
    for b in budgets:
        spent = decrypt_field(b.get('current_spent_enc', encrypt_field(0.0)))
        limit = decrypt_field(b['monthly_limit_enc'])
        threshold = b.get('alert_threshold', 80.0)
        percentage = (spent / limit * 100) if limit > 0 else 0
        if percentage >= threshold:
            alerts.append({
                "category": b['category'],
                "spent": spent,
                "limit": limit,
                "percentage": percentage,
            })
    return alerts


# ==================== INVESTMENT ROUTES ====================

@api_router.get("/investments")
async def get_investments(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    investments = await db.investments.find({"user_id": user['user_id']}).sort('date', -1).to_list(1000)
    return [serialize_investment(i) for i in investments]


@api_router.post("/investments")
async def create_investment(investment: InvestmentCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    inv_date = investment.date
    if inv_date.tzinfo is None:
        inv_date = inv_date.replace(tzinfo=timezone.utc)

    doc = {
        "investment_id": f"inv_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "name": investment.name,
        "type": investment.type,
        "quantity_enc": encrypt_field(investment.quantity),
        "purchase_price_enc": encrypt_field(investment.purchase_price),
        "current_price_enc": encrypt_field(investment.current_price),
        "coin_id": investment.coin_id,
        "date": inv_date,
    }
    await db.investments.insert_one(doc)
    doc.pop('_id', None)
    return serialize_investment(doc)


@api_router.put("/investments/{investment_id}")
async def update_investment(investment_id: str, investment: InvestmentCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    inv_date = investment.date
    if inv_date.tzinfo is None:
        inv_date = inv_date.replace(tzinfo=timezone.utc)

    result = await db.investments.update_one(
        {"investment_id": investment_id, "user_id": user['user_id']},
        {"$set": {
            "name": investment.name,
            "type": investment.type,
            "quantity_enc": encrypt_field(investment.quantity),
            "purchase_price_enc": encrypt_field(investment.purchase_price),
            "current_price_enc": encrypt_field(investment.current_price),
            "coin_id": investment.coin_id,
            "date": inv_date,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Investment not found")
    updated = await db.investments.find_one({"investment_id": investment_id})
    return serialize_investment(updated)


@api_router.delete("/investments/{investment_id}")
async def delete_investment(investment_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    result = await db.investments.delete_one({"investment_id": investment_id, "user_id": user['user_id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Investment not found")
    return {"message": "Investment deleted"}


@api_router.get("/investments/total")
async def get_investments_total(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    investments = await db.investments.find({"user_id": user['user_id']}).to_list(1000)
    total_invested = 0
    total_current = 0
    for i in investments:
        qty = decrypt_field(i['quantity_enc'])
        pp = decrypt_field(i['purchase_price_enc'])
        cp = decrypt_field(i['current_price_enc'])
        total_invested += qty * pp
        total_current += qty * cp
    profit_loss = total_current - total_invested
    pct = (profit_loss / total_invested * 100) if total_invested > 0 else 0

    result = {
        "total_invested": total_invested,
        "total_current_value": total_current,
        "profit_loss": profit_loss,
        "profit_loss_percentage": pct,
    }

    # Tipo de cambio ARS/USD, usando Tether (USDT ≈ 1 USD) como referencia.
    # Si falla la consulta externa, se omiten los campos _usd y el frontend
    # cae de nuevo a mostrar solo pesos (el toggle USD queda deshabilitado).
    try:
        async with httpx.AsyncClient() as http:
            fx_resp = await http.get(
                "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=ars",
                timeout=8.0,
            )
            if fx_resp.status_code == 200:
                rate = fx_resp.json().get("tether", {}).get("ars")
                if rate and rate > 0:
                    result["exchange_rate_ars_usd"] = rate
                    result["total_invested_usd"] = total_invested / rate
                    result["total_current_value_usd"] = total_current / rate
                    result["profit_loss_usd"] = profit_loss / rate
    except Exception:
        pass  # sin tipo de cambio disponible, el frontend usa solo ARS

    return result


# ==================== CRYPTO PRICES (CoinGecko) ====================

@api_router.get("/crypto/search")
async def crypto_search(q: str, authorization: Optional[str] = Header(None)):
    """Search cryptocurrencies on CoinGecko"""
    await get_current_user(authorization)
    async with httpx.AsyncClient() as http:
        response = await http.get(
            f"https://api.coingecko.com/api/v3/search?query={q}",
            timeout=10.0
        )
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="CoinGecko error")
        data = response.json()
        coins = data.get('coins', [])[:10]
        return [
            {
                "id": c['id'],
                "name": c['name'],
                "symbol": c['symbol'].upper(),
                "thumb": c.get('thumb'),
            } for c in coins
        ]


@api_router.get("/crypto/price/{coin_id}")
async def crypto_price(coin_id: str, authorization: Optional[str] = Header(None)):
    """Get current price in ARS for a specific cryptocurrency"""
    await get_current_user(authorization)
    try:
        async with httpx.AsyncClient() as http:
            response = await http.get(
                f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=ars,usd&include_24hr_change=true",
                timeout=10.0
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Timeout al consultar CoinGecko (tardó más de 10s en responder)")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"No se pudo conectar con CoinGecko: {str(e)}")

    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="CoinGecko limitó las consultas (rate limit). Esperá un minuto y probá de nuevo.")
    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"CoinGecko devolvió el error {response.status_code}: {response.text[:200]}")

    data = response.json()
    if coin_id not in data or not data[coin_id]:
        raise HTTPException(status_code=404, detail=f"CoinGecko no tiene precio para '{coin_id}'")

    return {
        "coin_id": coin_id,
        "price_ars": data[coin_id].get('ars', 0),
        "price_usd": data[coin_id].get('usd', 0),
        "change_24h": data[coin_id].get('ars_24h_change', 0),
    }


@api_router.post("/crypto/sync-prices")
async def sync_investment_prices(authorization: Optional[str] = Header(None)):
    """Sync current prices for all user's crypto investments that have coin_id"""
    user = await get_current_user(authorization)
    investments = await db.investments.find({
        "user_id": user['user_id'],
        "type": "crypto",
        "coin_id": {"$ne": None}
    }).to_list(1000)

    if not investments:
        return {"updated": 0}

    coin_ids = list(set(i['coin_id'] for i in investments if i.get('coin_id')))
    if not coin_ids:
        return {"updated": 0}

    async with httpx.AsyncClient() as http:
        response = await http.get(
            f"https://api.coingecko.com/api/v3/simple/price?ids={','.join(coin_ids)}&vs_currencies=ars",
            timeout=15.0
        )
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="CoinGecko error")
        prices = response.json()

    updated = 0
    for inv in investments:
        cid = inv.get('coin_id')
        if cid and cid in prices and 'ars' in prices[cid]:
            new_price = prices[cid]['ars']
            await db.investments.update_one(
                {"investment_id": inv['investment_id']},
                {"$set": {"current_price_enc": encrypt_field(new_price)}}
            )
            updated += 1

    return {"updated": updated}


# ==================== SAVINGS GOALS ====================

async def _goal_current_amount(user_id: str, goal_id: str) -> float:
    contributions = await db.savings_contributions.find(
        {"user_id": user_id, "goal_id": goal_id}
    ).to_list(2000)
    return sum(decrypt_field(c['amount_enc']) for c in contributions)


async def _link_transaction_to_goal(user_id: str, transaction_id: str, goal_id: str, amount: float, description: str, date: datetime):
    """
    Cuando se carga un movimiento de tipo 'saving' con una meta asignada,
    esto lo registra también como aporte a esa meta (así el progreso de la
    meta se actualiza solo, sin cargar el aporte dos veces a mano).
    """
    goal = await db.savings_goals.find_one({"goal_id": goal_id, "user_id": user_id})
    if not goal:
        return
    await db.savings_contributions.insert_one({
        "contribution_id": f"contrib_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "goal_id": goal_id,
        "amount_enc": encrypt_field(amount),
        "note": description or "Desde Movimientos",
        "date": date,
        "transaction_id": transaction_id,  # permite borrar en cascada si se borra la transacción
    })
    current = await _goal_current_amount(user_id, goal_id)
    target = decrypt_field(goal['target_amount_enc'])
    if current >= target and not goal.get('completed_at'):
        await db.savings_goals.update_one(
            {"goal_id": goal_id},
            {"$set": {"completed_at": datetime.now(timezone.utc)}}
        )


async def _unlink_transaction_from_goal(user_id: str, transaction_id: str):
    """Borra el aporte vinculado a una transacción (al editarla o eliminarla)."""
    contrib = await db.savings_contributions.find_one({"transaction_id": transaction_id, "user_id": user_id})
    if not contrib:
        return
    goal_id = contrib['goal_id']
    await db.savings_contributions.delete_one({"contribution_id": contrib['contribution_id']})
    goal = await db.savings_goals.find_one({"goal_id": goal_id})
    if goal:
        current = await _goal_current_amount(user_id, goal_id)
        target = decrypt_field(goal['target_amount_enc'])
        if current < target and goal.get('completed_at'):
            await db.savings_goals.update_one({"goal_id": goal_id}, {"$set": {"completed_at": None}})


def serialize_goal(doc, current_amount: float):
    target = decrypt_field(doc['target_amount_enc'])
    pct = (current_amount / target * 100) if target > 0 else 0
    return {
        "id": doc['goal_id'],
        "name": doc['name'],
        "target_amount": target,
        "current_amount": current_amount,
        "percentage": min(100, max(0, pct)),
        "deadline": doc['deadline'].isoformat() if doc.get('deadline') else None,
        "color": doc.get('color', '#4ADE80'),
        "icon": doc.get('icon', 'flag'),
        "photo": doc.get('photo'),
        "is_completed": current_amount >= target and target > 0,
        "completed_at": doc['completed_at'].isoformat() if doc.get('completed_at') else None,
    }


def serialize_contribution(doc):
    return {
        "id": doc['contribution_id'],
        "goal_id": doc['goal_id'],
        "amount": decrypt_field(doc['amount_enc']),
        "note": doc.get('note', ''),
        "date": doc['date'].isoformat() if isinstance(doc['date'], datetime) else doc['date'],
    }


@api_router.get("/savings-goals")
async def get_savings_goals(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    goals = await db.savings_goals.find({"user_id": user['user_id']}).to_list(200)
    result = []
    for g in goals:
        current = await _goal_current_amount(user['user_id'], g['goal_id'])
        result.append(serialize_goal(g, current))
    return result


@api_router.post("/savings-goals")
async def create_savings_goal(goal: SavingsGoalCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    deadline = goal.deadline
    if deadline and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    doc = {
        "goal_id": f"goal_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "name": goal.name,
        "target_amount_enc": encrypt_field(goal.target_amount),
        "deadline": deadline,
        "color": goal.color,
        "icon": goal.icon,
        "photo": goal.photo,
        "completed_at": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.savings_goals.insert_one(doc)
    doc.pop('_id', None)
    return serialize_goal(doc, 0)


@api_router.put("/savings-goals/{goal_id}")
async def update_savings_goal(goal_id: str, goal: SavingsGoalCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    deadline = goal.deadline
    if deadline and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    result = await db.savings_goals.update_one(
        {"goal_id": goal_id, "user_id": user['user_id']},
        {"$set": {
            "name": goal.name,
            "target_amount_enc": encrypt_field(goal.target_amount),
            "deadline": deadline,
            "color": goal.color,
            "icon": goal.icon,
            "photo": goal.photo,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    updated = await db.savings_goals.find_one({"goal_id": goal_id})
    current = await _goal_current_amount(user['user_id'], goal_id)
    return serialize_goal(updated, current)


@api_router.delete("/savings-goals/{goal_id}")
async def delete_savings_goal(goal_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    await db.savings_contributions.delete_many({"goal_id": goal_id, "user_id": user['user_id']})
    result = await db.savings_goals.delete_one({"goal_id": goal_id, "user_id": user['user_id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Goal not found")
    return {"message": "Goal deleted"}


@api_router.get("/savings-goals/{goal_id}/contributions")
async def get_goal_contributions(goal_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    items = await db.savings_contributions.find(
        {"goal_id": goal_id, "user_id": user['user_id']}
    ).sort('date', -1).to_list(2000)
    return [serialize_contribution(c) for c in items]


@api_router.post("/savings-goals/{goal_id}/contribute")
async def contribute_to_goal(goal_id: str, contribution: SavingsContributionCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    goal = await db.savings_goals.find_one({"goal_id": goal_id, "user_id": user['user_id']})
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    c_date = contribution.date
    if c_date.tzinfo is None:
        c_date = c_date.replace(tzinfo=timezone.utc)

    # Un aporte hecho acá también tiene que contar como "Ahorro" en el
    # Dashboard (que se calcula sumando movimientos), así que además del
    # aporte a la meta se crea un movimiento vinculado — igual que ya pasa
    # al revés, cuando cargás un Ahorro desde Movimientos con una meta.
    txn_doc = {
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "type": "saving",
        "amount_enc": encrypt_field(contribution.amount),
        "category": goal['name'],
        "description_enc": encrypt_field(contribution.note or f"Aporte a {goal['name']}"),
        "date": c_date,
        "created_at": datetime.now(timezone.utc),
        "goal_id": goal_id,
    }
    await db.transactions.insert_one(txn_doc)

    doc = {
        "contribution_id": f"contrib_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "goal_id": goal_id,
        "amount_enc": encrypt_field(contribution.amount),
        "note": contribution.note,
        "date": c_date,
        "transaction_id": txn_doc['transaction_id'],
    }
    await db.savings_contributions.insert_one(doc)

    current = await _goal_current_amount(user['user_id'], goal_id)
    target = decrypt_field(goal['target_amount_enc'])
    if current >= target and not goal.get('completed_at'):
        await db.savings_goals.update_one(
            {"goal_id": goal_id},
            {"$set": {"completed_at": datetime.now(timezone.utc)}}
        )
        goal = await db.savings_goals.find_one({"goal_id": goal_id})

    return serialize_goal(goal, current)


@api_router.delete("/savings-contributions/{contribution_id}")
async def delete_contribution(contribution_id: str, authorization: Optional[str] = Header(None)):
    """Deshace un aporte (o retiro) cargado por error."""
    user = await get_current_user(authorization)
    contrib = await db.savings_contributions.find_one({"contribution_id": contribution_id, "user_id": user['user_id']})
    if not contrib:
        raise HTTPException(status_code=404, detail="Contribution not found")
    await db.savings_contributions.delete_one({"contribution_id": contribution_id})

    # Si este aporte tenía un movimiento vinculado (para que contara en el
    # Dashboard), se borra también — si no, quedaría un "Ahorro" fantasma
    # en Movimientos sin el aporte que le dio origen.
    if contrib.get('transaction_id'):
        await db.transactions.delete_one({"transaction_id": contrib['transaction_id'], "user_id": user['user_id']})

    goal = await db.savings_goals.find_one({"goal_id": contrib['goal_id']})
    if goal:
        current = await _goal_current_amount(user['user_id'], contrib['goal_id'])
        target = decrypt_field(goal['target_amount_enc'])
        if current < target and goal.get('completed_at'):
            await db.savings_goals.update_one({"goal_id": contrib['goal_id']}, {"$set": {"completed_at": None}})

    return {"message": "Contribution deleted"}


# ==================== CREDIT CARDS ====================

_blue_rate_cache = {"rate": None, "fetched_at": None}


async def _get_blue_rate() -> Optional[float]:
    """
    Cotización de venta del dólar blue (DolarApi.com). Se cachea en
    memoria por 15 minutos para no golpear la API externa en cada
    pantalla — total, el blue no cambia segundo a segundo.
    """
    now = datetime.now(timezone.utc)
    if _blue_rate_cache["rate"] and _blue_rate_cache["fetched_at"] and (now - _blue_rate_cache["fetched_at"]).total_seconds() < 900:
        return _blue_rate_cache["rate"]
    try:
        async with httpx.AsyncClient() as http:
            response = await http.get("https://dolarapi.com/v1/dolares/blue", timeout=8.0)
            if response.status_code == 200:
                data = response.json()
                rate = data.get("venta")
                if rate and rate > 0:
                    _blue_rate_cache["rate"] = rate
                    _blue_rate_cache["fetched_at"] = now
                    return rate
    except Exception:
        pass
    return _blue_rate_cache["rate"]  # si falla, devuelve el último valor conocido (puede ser None)


@api_router.get("/fx/blue")
async def get_blue_rate(authorization: Optional[str] = Header(None)):
    await get_current_user(authorization)
    rate = await _get_blue_rate()
    return {"venta": rate}


def serialize_card(doc):
    return {
        "id": doc['card_id'],
        "name": doc['name'],
        "bank": doc.get('bank'),
        "last_digits": doc.get('last_digits'),
        "color": doc.get('color', '#A78BFA'),
        "closing_day": doc.get('closing_day', 1),
        "payment_due_day": doc.get('payment_due_day', 10),
    }


CARD_SUMMARY_CATEGORY = "Tarjeta"


def _fmt_ars(amount: float) -> str:
    """Formatea un monto en pesos argentinos, ej: 1234567.8 -> '$1.234.567,80'."""
    entero, decimales = f"{amount:,.2f}".split(".")
    entero = entero.replace(",", ".")
    return f"${entero},{decimales}"


async def _card_payment_included_totals(user_id: str, target_month: str):
    """
    Suma cuánto de lo pagado de resumen de tarjeta (vía "Pagué el resumen" /
    "Pago parcial") corresponde a compras marcadas para incluirse en el
    dashboard, para el resumen de un mes puntual (ej: "2026-08"). Todo
    entra bajo una única categoría ("Tarjeta"), no discriminado por la
    categoría de cada compra — así el resumen pagado aparece como un solo
    gasto en la torta, en vez de desglosarse en las categorías internas de
    cada compra.

    Se filtra por el CICLO del resumen (a qué mes corresponde lo que se
    pagó), no por la fecha en la que tocaste "Pagué el resumen" — si pagás
    hoy (septiembre) el resumen de agosto, tiene que sumar en la torta de
    agosto, no en la de septiembre.
    """
    total, _ = await _card_payment_breakdown(user_id, target_month)
    return total


async def _card_payment_breakdown(user_id: str, target_month: str):
    """
    Igual que _card_payment_included_totals, pero además devuelve cuánto
    corresponde a cada tarjeta puntual (por su nombre), para poder mostrar
    el detalle "Naranja X: $X · Visa Nativa: $Y" en la torta del dashboard.
    """
    payments = await db.card_payments.find({
        "user_id": user_id,
        "cycle": target_month,
    }).to_list(2000)
    if not payments:
        return 0.0, []

    card_ids = list({p['card_id'] for p in payments})
    cards = await db.credit_cards.find({"card_id": {"$in": card_ids}, "user_id": user_id}).to_list(200)
    card_names = {c['card_id']: c['name'] for c in cards}

    per_card: Dict[str, float] = {}
    total = 0.0
    for p in payments:
        amt = p.get('included_amount', 0.0)
        if amt <= 0:
            continue
        name = card_names.get(p['card_id'], 'Tarjeta')
        per_card[name] = per_card.get(name, 0.0) + amt
        total += amt

    breakdown = [{"card_name": name, "amount": amt} for name, amt in sorted(per_card.items(), key=lambda kv: -kv[1])]
    return total, breakdown


def _statement_cycle(date, closing_day):
    """
    A qué resumen (año, mes) pertenece una fecha, según el día de cierre.
    Si la fecha es antes o en el día de cierre, cae en el resumen de ESE mes.
    Si es después del cierre, cae en el resumen del mes SIGUIENTE.
    """
    if date.day <= closing_day:
        return (date.year, date.month)
    if date.month == 12:
        return (date.year + 1, 1)
    return (date.year, date.month + 1)


def _due_date_for_cycle(cycle_year, cycle_month, closing_day, due_day):
    """
    Fecha de vencimiento del resumen de un ciclo (año, mes) dado — solo
    informativa (para mostrarla en pantalla), no se usa para decidir si
    una compra está "Pagada". Si el día de vencimiento es posterior al de
    cierre, vence ese mismo mes (ej: cierra el 5, vence el 20). Si no,
    vence al mes siguiente del cierre (ej: cierra el 27, vence el 10 del
    mes que viene — el caso típico de Naranja X y la mayoría de las
    tarjetas argentinas).
    """
    if due_day > closing_day:
        return datetime(cycle_year, cycle_month, due_day, tzinfo=timezone.utc)
    if cycle_month == 12:
        return datetime(cycle_year + 1, 1, due_day, tzinfo=timezone.utc)
    return datetime(cycle_year, cycle_month + 1, due_day, tzinfo=timezone.utc)


def _cycle_key_for_offset(purchase_cycle, offset_months):
    """(año, mes) de un ciclo que arranca en purchase_cycle y avanza offset_months meses."""
    year = purchase_cycle[0] + (purchase_cycle[1] - 1 + offset_months) // 12
    month = (purchase_cycle[1] - 1 + offset_months) % 12 + 1
    return year, month


def _latest_closed_cycle(closing_day, reference_date=None):
    """
    El resumen (año, mes) MÁS RECIENTE que ya CERRÓ a la fecha dada (por
    default, ahora) — a diferencia de _statement_cycle(fecha, cierre), que
    contesta "¿a qué resumen entraría una compra hecha en esa fecha?" (que
    puede ser un resumen que todavía no cerró). Ej: cierre día 27, hoy
    30/08 → ya cerró el 27/08 → (año, 8). Hoy 20/08 (antes de que cierre
    este mes) → el más reciente que cerró es el del mes anterior, 27/07.
    """
    ref = reference_date or datetime.now(timezone.utc)
    year, month = _statement_cycle(ref, closing_day)
    month -= 1
    if month == 0:
        month = 12
        year -= 1
    return (year, month)


def _compute_current_installment(purchase_date, installments, manually_closed, closing_day, payment_due_day, paid_cycles, min_paid_count=0):
    """
    Devuelve (cuota_para_mostrar, is_finished, cuotas_realmente_pagadas).

    "cuota_para_mostrar" es puramente de calendario, contando cierres ya
    ocurridos — no depende de si se pagó o no, ni del vencimiento:
      1. El primer cierre en el que entra la compra = cuota 1.
      2. Cada cierre posterior (ya ocurrido) suma 1.
      3. Se cuentan los cierres hasta el último que YA CERRÓ (no el que
         se está acumulando todavía).
      4. Nunca supera la cantidad total de cuotas.

    "is_finished"/"cuotas_realmente_pagadas" son un tema aparte: siguen
    dependiendo de pagos confirmados con "Pagué el resumen" (no del
    calendario), para saber cuánto se debe todavía y cuándo se marca
    "Pagada" — sin relación con el número que se muestra en pantalla.
    """
    if manually_closed:
        return installments, True, installments

    if purchase_date.tzinfo is None:
        purchase_date = purchase_date.replace(tzinfo=timezone.utc)
    purchase_cycle = _statement_cycle(purchase_date, closing_day)

    # --- Número de cuota a mostrar: puro calendario ---
    latest_closed = _latest_closed_cycle(closing_day)
    closes_elapsed = (latest_closed[0] - purchase_cycle[0]) * 12 + (latest_closed[1] - purchase_cycle[1])
    display_installment = max(1, min(installments, closes_elapsed + 1))

    # --- Cuotas realmente pagadas / is_finished: aparte, por pagos reales ---
    paid_count = min(installments, max(0, min_paid_count))
    for i in range(paid_count, installments):
        year, month = _cycle_key_for_offset(purchase_cycle, i)
        key = f"{year:04d}-{month:02d}"
        if key in paid_cycles:
            paid_count += 1
        else:
            break

    is_finished = paid_count >= installments
    if is_finished:
        return installments, True, paid_count

    return display_installment, False, paid_count


def serialize_card_expense(doc, closing_day=1, payment_due_day=10, paid_cycles=None):
    total = decrypt_field(doc['total_amount_enc'])
    installments = doc.get('installments', 1)
    installment_amount = total / installments if installments > 0 else total
    purchase_date = doc['purchase_date']
    manually_closed = doc.get('manually_closed', False)
    min_paid_count = doc.get('migrated_grandfather_paid', 0)

    current_installment, is_finished, paid_count = _compute_current_installment(
        purchase_date, installments, manually_closed, closing_day, payment_due_day, paid_cycles or set(), min_paid_count
    )
    # La plata que realmente falta pagar se calcula con las cuotas REALMENTE
    # pagadas (paid_count), no con el número que se muestra en pantalla —
    # así nunca se "esconde" una cuota vencida y no pagada.
    remaining_installments = 0 if is_finished else (installments - paid_count)
    remaining_amount = installment_amount * remaining_installments

    # A qué mes corresponde la cuota que se está mostrando ("Cuota 5 de 6"
    # → ¿es la de septiembre? ¿la de agosto?), y si esa cuota puntual ya
    # está pagada — para poder pintarla verde o roja en la lista.
    if purchase_date.tzinfo is None:
        purchase_date_tz = purchase_date.replace(tzinfo=timezone.utc)
    else:
        purchase_date_tz = purchase_date
    purchase_cycle = _statement_cycle(purchase_date_tz, closing_day)
    cuota_year, cuota_month = _cycle_key_for_offset(purchase_cycle, current_installment - 1)
    cuota_cycle_key = f"{cuota_year:04d}-{cuota_month:02d}"
    cuota_paid = is_finished or (cuota_cycle_key in (paid_cycles or set())) or (current_installment <= min_paid_count)

    return {
        "id": doc['expense_id'],
        "card_id": doc['card_id'],
        "description": doc['description'],
        "category": doc.get('category'),
        "total_amount": total,
        "installments": installments,
        "installment_amount": installment_amount,
        "current_installment": current_installment,
        "paid_installments": paid_count,
        "remaining_installments": remaining_installments,
        "remaining_amount": remaining_amount,
        "purchase_date": purchase_date.isoformat() if hasattr(purchase_date, 'isoformat') else purchase_date,
        "is_finished": is_finished,
        "include_in_summary": doc.get('include_in_summary', True),
        "manually_closed": manually_closed,
        "cuota_month": cuota_cycle_key,
        "cuota_paid": cuota_paid,
        "currency": doc.get('currency', 'ARS'),
        "original_amount_usd": decrypt_field(doc['original_amount_usd_enc']) if doc.get('original_amount_usd_enc') else None,
        "fx_rate_used": doc.get('fx_rate_used'),
        "is_fixed_monthly": doc.get('is_fixed_monthly', False),
        "is_fixed_monthly_instance": bool(doc.get('fixed_monthly_source_id')),
    }


@api_router.get("/cards")
async def get_cards(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    cards = await db.credit_cards.find({"user_id": user['user_id']}).to_list(100)
    return [serialize_card(c) for c in cards]


@api_router.post("/cards")
async def create_card(card: CreditCardCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    doc = {
        "card_id": f"card_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "name": card.name,
        "bank": card.bank,
        "last_digits": card.last_digits,
        "color": card.color,
        "closing_day": card.closing_day,
        "payment_due_day": card.payment_due_day,
        "created_at": datetime.now(timezone.utc),
    }
    await db.credit_cards.insert_one(doc)
    doc.pop('_id', None)
    return serialize_card(doc)


@api_router.put("/cards/{card_id}")
async def update_card(card_id: str, card: CreditCardCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    result = await db.credit_cards.update_one(
        {"card_id": card_id, "user_id": user['user_id']},
        {"$set": {
            "name": card.name, "bank": card.bank, "last_digits": card.last_digits,
            "color": card.color, "closing_day": card.closing_day, "payment_due_day": card.payment_due_day,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Card not found")
    updated = await db.credit_cards.find_one({"card_id": card_id})
    return serialize_card(updated)


@api_router.delete("/cards/{card_id}")
async def delete_card(card_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    await db.card_expenses.delete_many({"card_id": card_id, "user_id": user['user_id']})
    await db.card_payments.delete_many({"card_id": card_id, "user_id": user['user_id']})
    result = await db.credit_cards.delete_one({"card_id": card_id, "user_id": user['user_id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"message": "Card deleted"}


async def _ensure_fixed_monthly_card_charges(user_id: str):
    """
    Para cada gasto marcado como "fijo mensual" (is_fixed_monthly), genera
    solo la copia del ciclo actual si todavía no se generó — mismo patrón
    que los recurrentes de Movimientos, pero para tarjetas: no hace falta
    recargar la suscripción/gasto fijo cada mes, se repite solo con el
    mismo monto (y la misma cotización si era en dólares).
    """
    templates = await db.card_expenses.find({"user_id": user_id, "is_fixed_monthly": True}).to_list(500)
    for tmpl in templates:
        card = await db.credit_cards.find_one({"card_id": tmpl['card_id']})
        closing_day = card.get('closing_day', 1) if card else 1
        now = datetime.now(timezone.utc)
        year, month = _statement_cycle(now, closing_day)
        current_cycle = f"{year:04d}-{month:02d}"
        if tmpl.get('last_generated_cycle') == current_cycle:
            continue

        new_doc = {
            "expense_id": f"cexp_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "card_id": tmpl['card_id'],
            "description": tmpl['description'],
            "category": tmpl.get('category'),
            "total_amount_enc": tmpl['total_amount_enc'],
            "original_amount_usd_enc": tmpl.get('original_amount_usd_enc'),
            "fx_rate_used": tmpl.get('fx_rate_used'),
            "currency": tmpl.get('currency', 'ARS'),
            "installments": 1,
            "purchase_date": now,
            "manually_closed": False,
            "include_in_summary": tmpl.get('include_in_summary', True),
            "is_fixed_monthly": False,
            "fixed_monthly_source_id": tmpl['expense_id'],
        }
        await db.card_expenses.insert_one(new_doc)
        await db.card_expenses.update_one(
            {"expense_id": tmpl['expense_id']},
            {"$set": {"last_generated_cycle": current_cycle}}
        )


def _cycle_key(closing_day: int) -> str:
    """
    Identificador del resumen que YA CERRÓ y está pendiente de pago ahora
    mismo (ej: '2026-08') — no el que se está acumulando todavía. Es el
    que corresponde usar tanto para "cuánto debo este mes" como para
    etiquetar un pago cuando tocás "Pagué el resumen" / "Pago parcial".
    """
    year, month = _statement_cycle(datetime.now(timezone.utc), closing_day)
    month -= 1
    if month == 0:
        month = 12
        year -= 1
    return f"{year:04d}-{month:02d}"


def _is_full_payment(payment_doc) -> bool:
    """
    Si un pago cubrió el total que correspondía a ese resumen (no un pago
    parcial). Los pagos nuevos ya guardan esto directamente
    (is_full_payment); para pagos viejos, cargados antes de este cambio,
    se lo aproxima comparando el monto pagado contra el "amount_due" que
    ya se guardaba en ese momento.
    """
    if 'is_full_payment' in payment_doc:
        return payment_doc['is_full_payment']
    amount_due = payment_doc.get('amount_due', 0)
    if amount_due <= 0:
        return False
    return decrypt_field(payment_doc['amount_paid_enc']) >= amount_due - 0.5


def _paid_cycles_by_card(payments: list) -> Dict[str, set]:
    """Agrupa, por tarjeta, el conjunto de resúmenes (ciclos) ya marcados como pagados por completo."""
    result: Dict[str, set] = {}
    for p in payments:
        if _is_full_payment(p):
            result.setdefault(p['card_id'], set()).add(p['cycle'])
    return result


@api_router.get("/cards/summary")
async def get_cards_summary(authorization: Optional[str] = Header(None)):
    """Resumen general: cuánto se debe este mes y en total, por tarjeta y sumado."""
    user = await get_current_user(authorization)
    await _ensure_fixed_monthly_card_charges(user['user_id'])
    cards = await db.credit_cards.find({"user_id": user['user_id']}).to_list(100)
    all_expenses = await db.card_expenses.find({"user_id": user['user_id']}).to_list(2000)
    all_payments = await db.card_payments.find({"user_id": user['user_id']}).to_list(2000)

    closing_days = {c['card_id']: c.get('closing_day', 1) for c in cards}
    due_days = {c['card_id']: c.get('payment_due_day', 10) for c in cards}
    cycle_keys = {c['card_id']: _cycle_key(closing_days.get(c['card_id'], 1)) for c in cards}
    paid_cycles_by_card = _paid_cycles_by_card(all_payments)

    per_card = {c['card_id']: {
        "card": serialize_card(c), "this_month": 0.0, "pending_total": 0.0, "expenses_count": 0,
        "paid_this_cycle": 0.0, "cycle": cycle_keys[c['card_id']],
    } for c in cards}

    total_this_month = 0.0
    total_pending = 0.0

    for e in all_expenses:
        cid = e['card_id']
        if cid not in per_card:
            continue
        se = serialize_card_expense(e, closing_days.get(cid, 1), due_days.get(cid, 10), paid_cycles_by_card.get(cid, set()))
        per_card[cid]["expenses_count"] += 1
        if not se["is_finished"]:
            per_card[cid]["this_month"] += se["installment_amount"]
            total_this_month += se["installment_amount"]
        per_card[cid]["pending_total"] += se["remaining_amount"]
        total_pending += se["remaining_amount"]

    for p in all_payments:
        cid = p['card_id']
        if cid not in per_card or p.get('cycle') != per_card[cid]['cycle']:
            continue
        per_card[cid]["paid_this_cycle"] += decrypt_field(p['amount_paid_enc'])

    for c in per_card.values():
        c["pending_this_cycle"] = max(0.0, c["this_month"] - c["paid_this_cycle"])
        c["cycle_paid"] = c["paid_this_cycle"] >= c["this_month"] and c["this_month"] > 0

    # Además del total en pesos (de siempre), se agrega el equivalente en
    # dólares al blue de HOY — es solo de referencia, no cambia ningún
    # cálculo interno (que sigue todo en pesos).
    blue_rate = await _get_blue_rate()
    if blue_rate:
        for c in per_card.values():
            c["this_month_usd"] = c["this_month"] / blue_rate
            c["pending_total_usd"] = c["pending_total"] / blue_rate

    return {
        "cards": list(per_card.values()),
        "total_this_month": total_this_month,
        "total_pending": total_pending,
        "blue_rate": blue_rate,
        "total_this_month_usd": (total_this_month / blue_rate) if blue_rate else None,
        "total_pending_usd": (total_pending / blue_rate) if blue_rate else None,
    }


@api_router.get("/cards/{card_id}/expenses")
async def get_card_expenses(card_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    await _ensure_fixed_monthly_card_charges(user['user_id'])
    card = await db.credit_cards.find_one({"card_id": card_id, "user_id": user['user_id']})
    closing_day = card.get('closing_day', 1) if card else 1
    payment_due_day = card.get('payment_due_day', 10) if card else 10
    payments = await db.card_payments.find({"card_id": card_id, "user_id": user['user_id']}).to_list(2000)
    paid_cycles = _paid_cycles_by_card(payments).get(card_id, set())
    expenses = await db.card_expenses.find(
        {"card_id": card_id, "user_id": user['user_id']}
    ).sort('purchase_date', -1).to_list(1000)
    return [serialize_card_expense(e, closing_day, payment_due_day, paid_cycles) for e in expenses]


def serialize_card_payment(doc):
    return {
        "id": doc['payment_id'],
        "card_id": doc['card_id'],
        "cycle": doc['cycle'],
        "amount_due": doc.get('amount_due', 0),
        "included_amount": doc.get('included_amount', 0),
        "amount_paid": decrypt_field(doc['amount_paid_enc']),
        "date": doc['date'].isoformat() if isinstance(doc['date'], datetime) else doc['date'],
    }


@api_router.post("/cards/{card_id}/pay")
async def pay_card_statement(card_id: str, payment: CardPaymentCreate, authorization: Optional[str] = Header(None)):
    """
    Registra un pago del resumen actual (total o parcial). No calcula
    intereses ni recalcula cuotas — es un registro informativo de cuánto
    pagaste de lo que correspondía este mes. Si pagás de menos, la
    diferencia queda como "pendiente de este resumen"; cualquier interés
    que te cobre el banco por eso lo cargás vos como un gasto aparte
    cuando te llegue en el resumen real.
    """
    user = await get_current_user(authorization)
    card = await db.credit_cards.find_one({"card_id": card_id, "user_id": user['user_id']})
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    closing_day = card.get('closing_day', 1)
    payment_due_day = card.get('payment_due_day', 10)
    cycle = _cycle_key(closing_day)

    # Cuánto corresponde este mes (mismo cálculo que en el resumen general),
    # separando lo que está tildado para sumar a la torta del dashboard.
    # (los pagos previos de esta tarjeta se usan para saber qué compras ya
    # estaban "Pagada" antes de este nuevo pago)
    existing_payments = await db.card_payments.find({"card_id": card_id, "user_id": user['user_id']}).to_list(2000)
    paid_cycles = _paid_cycles_by_card(existing_payments).get(card_id, set())
    expenses = await db.card_expenses.find({"card_id": card_id, "user_id": user['user_id']}).to_list(2000)
    serialized = [serialize_card_expense(e, closing_day, payment_due_day, paid_cycles) for e in expenses]
    pending = [s for s in serialized if not s["is_finished"]]
    amount_due = sum(s["installment_amount"] for s in pending)
    amount_due_included = sum(s["installment_amount"] for s in pending if s["include_in_summary"])

    p_date = payment.date
    if p_date.tzinfo is None:
        p_date = p_date.replace(tzinfo=timezone.utc)

    # Si pagás menos que lo que corresponde (pago parcial), prorrateamos esa
    # misma proporción sobre la parte "incluida", para no sumar a la torta
    # más de lo que realmente pagaste.
    included_amount = payment.amount_paid * (amount_due_included / amount_due) if amount_due > 0 else 0.0
    # Solo un pago que cubre el total pendiente de este resumen marca las
    # compras de ese ciclo como "Pagada" — un pago parcial no alcanza.
    is_full_payment = amount_due > 0 and payment.amount_paid >= amount_due - 0.5

    doc = {
        "payment_id": f"pay_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "card_id": card_id,
        "cycle": cycle,
        "amount_due": amount_due,
        "amount_due_included": amount_due_included,
        "included_amount": included_amount,
        "is_full_payment": is_full_payment,
        "amount_paid_enc": encrypt_field(payment.amount_paid),
        "date": p_date,
    }
    await db.card_payments.insert_one(doc)
    doc.pop('_id', None)
    return serialize_card_payment(doc)


@api_router.get("/cards/{card_id}/payments")
async def get_card_payments(card_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    payments = await db.card_payments.find(
        {"card_id": card_id, "user_id": user['user_id']}
    ).sort('date', -1).to_list(500)
    return [serialize_card_payment(p) for p in payments]


@api_router.get("/cards/{card_id}/statements")
async def get_card_statements(card_id: str, authorization: Optional[str] = Header(None)):
    """
    Agrupa, por resumen (mes de cierre) ya cerrado, qué compras/cuotas
    entraron en cada uno, cuánto sumaban en total, y si ese resumen quedó
    marcado como pagado — para poder ver resúmenes anteriores (ej: julio)
    con el mismo detalle que el resumen actual.
    """
    user = await get_current_user(authorization)
    card = await db.credit_cards.find_one({"card_id": card_id, "user_id": user['user_id']})
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    closing_day = card.get('closing_day', 1)

    expenses = await db.card_expenses.find({"card_id": card_id, "user_id": user['user_id']}).to_list(2000)
    payments = await db.card_payments.find({"card_id": card_id, "user_id": user['user_id']}).to_list(2000)
    paid_cycles = _paid_cycles_by_card(payments).get(card_id, set())
    paid_amounts_by_cycle: Dict[str, float] = {}
    for p in payments:
        paid_amounts_by_cycle[p['cycle']] = paid_amounts_by_cycle.get(p['cycle'], 0.0) + decrypt_field(p['amount_paid_enc'])

    latest_year, latest_month = _latest_closed_cycle(closing_day)
    latest_closed_key = f"{latest_year:04d}-{latest_month:02d}"

    statements: Dict[str, dict] = {}
    for e in expenses:
        total = decrypt_field(e['total_amount_enc'])
        installments = e.get('installments', 1)
        installment_amount = total / installments if installments > 0 else total
        purchase_date = e['purchase_date']
        if purchase_date.tzinfo is None:
            purchase_date = purchase_date.replace(tzinfo=timezone.utc)
        purchase_cycle = _statement_cycle(purchase_date, closing_day)
        for i in range(installments):
            year, month = _cycle_key_for_offset(purchase_cycle, i)
            key = f"{year:04d}-{month:02d}"
            if key > latest_closed_key:
                continue  # todavía no cerró ese resumen, no corresponde mostrarlo como "anterior"
            if key not in statements:
                statements[key] = {"cycle": key, "total": 0.0, "items": []}
            statements[key]["total"] += installment_amount
            statements[key]["items"].append({
                "expense_id": e['expense_id'],
                "description": e['description'],
                "category": e.get('category'),
                "installment_amount": installment_amount,
                "cuota_label": f"{i + 1} de {installments}",
            })

    result = [
        {
            "cycle": key,
            "total": st["total"],
            "paid_amount": paid_amounts_by_cycle.get(key, 0.0),
            "is_paid": key in paid_cycles,
            "items": sorted(st["items"], key=lambda it: it["description"]),
        }
        for key, st in statements.items()
    ]
    result.sort(key=lambda r: r['cycle'], reverse=True)
    return result


async def _resolve_card_expense_currency_fields(expense: CardExpenseCreate) -> dict:
    """
    Si la compra es en USD, convierte a pesos usando la cotización del
    dólar blue (la que se haya pasado, o si no la actual) y guarda tanto
    el monto en pesos ya convertido (para que todo el resto de la lógica
    de cuotas/resúmenes siga funcionando en pesos sin tocar nada más) como
    el monto y la cotización originales en USD, para poder mostrarlos.
    """
    if expense.currency == 'USD':
        rate = expense.fx_rate or await _get_blue_rate()
        if not rate:
            raise HTTPException(status_code=502, detail="No se pudo obtener la cotización del dólar blue. Ingresala manualmente.")
        return {
            "total_amount_enc": encrypt_field(expense.total_amount * rate),
            "original_amount_usd_enc": encrypt_field(expense.total_amount),
            "fx_rate_used": rate,
            "currency": "USD",
        }
    return {
        "total_amount_enc": encrypt_field(expense.total_amount),
        "original_amount_usd_enc": None,
        "fx_rate_used": None,
        "currency": "ARS",
    }


@api_router.post("/card-expenses")
async def create_card_expense(expense: CardExpenseCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    card = await db.credit_cards.find_one({"card_id": expense.card_id, "user_id": user['user_id']})
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    p_date = expense.purchase_date
    if p_date.tzinfo is None:
        p_date = p_date.replace(tzinfo=timezone.utc)

    currency_fields = await _resolve_card_expense_currency_fields(expense)
    is_fixed_monthly = expense.is_fixed_monthly
    installments = 1 if is_fixed_monthly else max(1, expense.installments)
    closing_day = card.get('closing_day', 1)

    doc = {
        "expense_id": f"cexp_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "card_id": expense.card_id,
        "description": expense.description,
        "category": expense.category,
        "installments": installments,
        "purchase_date": p_date,
        "manually_closed": False,
        "include_in_summary": expense.include_in_summary,
        "is_fixed_monthly": is_fixed_monthly,
        **currency_fields,
    }
    if is_fixed_monthly:
        # Ya "cubrió" el ciclo en el que se creó — el generador automático
        # recién le va a crear una copia nueva a partir del ciclo siguiente.
        year, month = _statement_cycle(p_date, closing_day)
        doc["last_generated_cycle"] = f"{year:04d}-{month:02d}"
    await db.card_expenses.insert_one(doc)
    doc.pop('_id', None)
    payments = await db.card_payments.find({"card_id": expense.card_id, "user_id": user['user_id']}).to_list(2000)
    paid_cycles = _paid_cycles_by_card(payments).get(expense.card_id, set())
    return serialize_card_expense(doc, card.get('closing_day', 1), card.get('payment_due_day', 10), paid_cycles)


@api_router.put("/card-expenses/{expense_id}")
async def update_card_expense(expense_id: str, expense: CardExpenseCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    p_date = expense.purchase_date
    if p_date.tzinfo is None:
        p_date = p_date.replace(tzinfo=timezone.utc)

    currency_fields = await _resolve_card_expense_currency_fields(expense)
    installments = 1 if expense.is_fixed_monthly else max(1, expense.installments)

    result = await db.card_expenses.update_one(
        {"expense_id": expense_id, "user_id": user['user_id']},
        {"$set": {
            "card_id": expense.card_id,
            "description": expense.description,
            "category": expense.category,
            "installments": installments,
            "purchase_date": p_date,
            "include_in_summary": expense.include_in_summary,
            "is_fixed_monthly": expense.is_fixed_monthly,
            **currency_fields,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    updated = await db.card_expenses.find_one({"expense_id": expense_id})
    card = await db.credit_cards.find_one({"card_id": updated['card_id']})
    payments = await db.card_payments.find({"card_id": updated['card_id'], "user_id": user['user_id']}).to_list(2000)
    paid_cycles = _paid_cycles_by_card(payments).get(updated['card_id'], set())
    return serialize_card_expense(updated, card.get('closing_day', 1) if card else 1, card.get('payment_due_day', 10) if card else 10, paid_cycles)


@api_router.delete("/card-expenses/{expense_id}")
async def delete_card_expense(expense_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    result = await db.card_expenses.delete_one({"expense_id": expense_id, "user_id": user['user_id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted"}


@api_router.post("/card-expenses/{expense_id}/close")
async def close_card_expense(expense_id: str, authorization: Optional[str] = Header(None)):
    """Marca una compra en cuotas como saldada por completo (pago anticipado)."""
    user = await get_current_user(authorization)
    result = await db.card_expenses.update_one(
        {"expense_id": expense_id, "user_id": user['user_id']},
        {"$set": {"manually_closed": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    updated = await db.card_expenses.find_one({"expense_id": expense_id})
    card = await db.credit_cards.find_one({"card_id": updated['card_id']})
    payments = await db.card_payments.find({"card_id": updated['card_id'], "user_id": user['user_id']}).to_list(2000)
    paid_cycles = _paid_cycles_by_card(payments).get(updated['card_id'], set())
    return serialize_card_expense(updated, card.get('closing_day', 1) if card else 1, card.get('payment_due_day', 10) if card else 10, paid_cycles)


# ==================== CUENTA SUPER (cuenta corriente del súper) ====================
# Funciona con ciclos mensuales, como un mini-resumen (sin cuotas ni fecha
# de cierre): cada mes calendario arranca en cero, los gastos se van
# acumulando ahí, y podés pagarlo (con reintegro opcional). El monto NETO
# pagado (pagado - reintegro) es lo que entra al dashboard, en el mes al
# que corresponde el pago. Los meses anteriores quedan disponibles como
# historial de solo lectura (mismo patrón que "resúmenes anteriores" de
# las tarjetas).

def serialize_super_expense(doc):
    return {
        "id": doc['expense_id'],
        "description": doc['description'],
        "amount": decrypt_field(doc['amount_enc']),
        "date": doc['date'].isoformat() if hasattr(doc['date'], 'isoformat') else doc['date'],
    }


def serialize_super_payment(doc):
    return {
        "id": doc['payment_id'],
        "amount_paid": decrypt_field(doc['amount_paid_enc']),
        "reimbursement": decrypt_field(doc['reimbursement_enc']),
        "net_amount": decrypt_field(doc['net_amount_enc']),
        "cycle": doc.get('cycle'),
        "date": doc['date'].isoformat() if hasattr(doc['date'], 'isoformat') else doc['date'],
    }


@api_router.get("/super-account/summary")
async def get_super_account_summary(authorization: Optional[str] = Header(None)):
    """
    Resumen del mes ACTUAL (arranca en cero cada mes): cuánto se gastó
    este mes, cuánto se pagó de este mes, y el detalle de gastos del mes
    para poder editarlos/borrarlos. También incluye el total histórico
    acumulado de toda la vida, solo informativo.
    """
    user = await get_current_user(authorization)
    expenses = await db.super_account_expenses.find({"user_id": user['user_id']}).sort('date', -1).to_list(3000)
    payments = await db.super_account_payments.find({"user_id": user['user_id']}).to_list(2000)

    current_month = datetime.now(timezone.utc).strftime('%Y-%m')

    total_all_time = sum(decrypt_field(e['amount_enc']) for e in expenses)

    month_expenses = []
    for e in expenses:
        d = e['date']
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        if d.strftime('%Y-%m') == current_month:
            month_expenses.append(e)
    month_total = sum(decrypt_field(e['amount_enc']) for e in month_expenses)

    month_paid = sum(decrypt_field(p['amount_paid_enc']) for p in payments if p.get('cycle') == current_month)

    return {
        "current_month": current_month,
        "total_all_time": total_all_time,
        "month_total": month_total,
        "month_paid": month_paid,
        "month_is_paid": month_total > 0 and month_paid >= month_total,
        "expenses": [serialize_super_expense(e) for e in month_expenses],
    }


@api_router.get("/super-account/statements")
async def get_super_account_statements(authorization: Optional[str] = Header(None)):
    """Meses anteriores (ya cerrados) con su total, cuánto se pagó, y el detalle de gastos de cada uno."""
    user = await get_current_user(authorization)
    expenses = await db.super_account_expenses.find({"user_id": user['user_id']}).to_list(3000)
    payments = await db.super_account_payments.find({"user_id": user['user_id']}).to_list(2000)

    current_month = datetime.now(timezone.utc).strftime('%Y-%m')

    paid_by_cycle: Dict[str, float] = {}
    for p in payments:
        cyc = p.get('cycle')
        if cyc:
            paid_by_cycle[cyc] = paid_by_cycle.get(cyc, 0.0) + decrypt_field(p['amount_paid_enc'])

    by_month: Dict[str, dict] = {}
    for e in expenses:
        d = e['date']
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        key = d.strftime('%Y-%m')
        if key == current_month:
            continue  # el mes actual se ve en el resumen principal, no acá
        if key not in by_month:
            by_month[key] = {"cycle": key, "total": 0.0, "items": []}
        amount = decrypt_field(e['amount_enc'])
        by_month[key]["total"] += amount
        by_month[key]["items"].append({
            "expense_id": e['expense_id'],
            "description": e['description'],
            "amount": amount,
        })

    result = []
    for key, st in by_month.items():
        paid_amount = paid_by_cycle.get(key, 0.0)
        result.append({
            "cycle": key,
            "total": st["total"],
            "paid_amount": paid_amount,
            "is_paid": st["total"] > 0 and paid_amount >= st["total"],
            "items": sorted(st["items"], key=lambda it: it["description"]),
        })
    result.sort(key=lambda r: r['cycle'], reverse=True)
    return result


@api_router.post("/super-account/expenses")
async def create_super_expense(expense: SuperExpenseCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    e_date = expense.date
    if e_date.tzinfo is None:
        e_date = e_date.replace(tzinfo=timezone.utc)
    doc = {
        "expense_id": f"sexp_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "description": expense.description,
        "amount_enc": encrypt_field(expense.amount),
        "date": e_date,
    }
    await db.super_account_expenses.insert_one(doc)
    doc.pop('_id', None)
    return serialize_super_expense(doc)


@api_router.put("/super-account/expenses/{expense_id}")
async def update_super_expense(expense_id: str, expense: SuperExpenseCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    e_date = expense.date
    if e_date.tzinfo is None:
        e_date = e_date.replace(tzinfo=timezone.utc)
    result = await db.super_account_expenses.update_one(
        {"expense_id": expense_id, "user_id": user['user_id']},
        {"$set": {
            "description": expense.description,
            "amount_enc": encrypt_field(expense.amount),
            "date": e_date,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    updated = await db.super_account_expenses.find_one({"expense_id": expense_id})
    return serialize_super_expense(updated)


@api_router.delete("/super-account/expenses/{expense_id}")
async def delete_super_expense(expense_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    result = await db.super_account_expenses.delete_one({"expense_id": expense_id, "user_id": user['user_id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Deleted"}


@api_router.post("/super-account/pay")
async def pay_super_account(payment: SuperPaymentCreate, authorization: Optional[str] = Header(None)):
    """
    Registra un pago de la Cuenta Super. Por default paga el mes ACTUAL
    (el que está corriendo); si se manda `cycle` explícito (ej: "2026-08"),
    paga ese mes puntual en vez del actual — para poder saldar un mes
    anterior que quedó pendiente. El reintegro es solo informativo de la
    promo, y lo que se suma al dashboard es el NETO (amount_paid -
    reimbursement), en el mes al que corresponde el pago (no en el que se
    tocó el botón).
    """
    user = await get_current_user(authorization)
    p_date = payment.date
    if p_date.tzinfo is None:
        p_date = p_date.replace(tzinfo=timezone.utc)
    cycle = payment.cycle or datetime.now(timezone.utc).strftime('%Y-%m')
    net_amount = payment.amount_paid - payment.reimbursement
    doc = {
        "payment_id": f"spay_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "amount_paid_enc": encrypt_field(payment.amount_paid),
        "reimbursement_enc": encrypt_field(payment.reimbursement),
        "net_amount_enc": encrypt_field(net_amount),
        "cycle": cycle,
        "date": p_date,
    }
    await db.super_account_payments.insert_one(doc)
    doc.pop('_id', None)
    return serialize_super_payment(doc)


async def _super_account_included_total(user_id: str, target_month: str) -> float:
    """Suma el NETO de los pagos de Cuenta Super que corresponden a ese mes (por ciclo, no por fecha de pago)."""
    payments = await db.super_account_payments.find({"user_id": user_id, "cycle": target_month}).to_list(2000)
    return sum(decrypt_field(p['net_amount_enc']) for p in payments)


# ==================== LOANS (plata prestada a personas) ====================


async def _loan_total_paid(user_id: str, loan_id: str) -> float:
    payments = await db.loan_payments.find({"user_id": user_id, "loan_id": loan_id}).to_list(2000)
    return sum(decrypt_field(p['amount_enc']) for p in payments)


def _loan_interest_accrued(principal: float, monthly_rate: Optional[float], loan_date: datetime) -> float:
    """
    Interés simple: se calcula sobre el capital original, un mes = una
    "cuota" de interés más, sin interés compuesto. Es un cálculo aproximado
    y transparente — no reemplaza lo que efectivamente hayan acordado.
    """
    if not monthly_rate or monthly_rate <= 0:
        return 0.0
    now = datetime.now(timezone.utc)
    if loan_date.tzinfo is None:
        loan_date = loan_date.replace(tzinfo=timezone.utc)
    months_elapsed = (now.year - loan_date.year) * 12 + (now.month - loan_date.month)
    months_elapsed = max(0, months_elapsed)
    return principal * (monthly_rate / 100) * months_elapsed


def serialize_loan(doc, total_paid: float):
    principal = decrypt_field(doc['amount_enc'])
    monthly_rate = doc.get('monthly_interest_rate')
    loan_date = doc['date']
    if loan_date.tzinfo is None:
        loan_date = loan_date.replace(tzinfo=timezone.utc)
    interest = _loan_interest_accrued(principal, monthly_rate, loan_date)
    total_owed = principal + interest
    remaining = max(0.0, total_owed - total_paid)
    pct = (total_paid / total_owed * 100) if total_owed > 0 else 0
    return {
        "id": doc['loan_id'],
        "person_name": doc['person_name'],
        "description": doc.get('description', ''),
        "amount": principal,
        "monthly_interest_rate": monthly_rate,
        "interest_accrued": interest,
        "total_owed": total_owed,
        "total_paid": total_paid,
        "remaining": remaining,
        "percentage": min(100, max(0, pct)),
        "date": doc['date'].isoformat() if isinstance(doc['date'], datetime) else doc['date'],
        "is_settled": remaining <= 0.01 and total_owed > 0,
        "settled_at": doc['settled_at'].isoformat() if doc.get('settled_at') else None,
    }


def serialize_loan_payment(doc):
    return {
        "id": doc['payment_id'],
        "loan_id": doc['loan_id'],
        "amount": decrypt_field(doc['amount_enc']),
        "note": doc.get('note', ''),
        "date": doc['date'].isoformat() if isinstance(doc['date'], datetime) else doc['date'],
    }


@api_router.get("/loans")
async def get_loans(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    loans = await db.loans.find({"user_id": user['user_id']}).to_list(500)
    result = []
    for l in loans:
        paid = await _loan_total_paid(user['user_id'], l['loan_id'])
        result.append(serialize_loan(l, paid))
    return result


@api_router.post("/loans")
async def create_loan(loan: LoanCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    loan_date = loan.date
    if loan_date.tzinfo is None:
        loan_date = loan_date.replace(tzinfo=timezone.utc)
    doc = {
        "loan_id": f"loan_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "person_name": loan.person_name,
        "description": loan.description,
        "amount_enc": encrypt_field(loan.amount),
        "date": loan_date,
        "monthly_interest_rate": loan.monthly_interest_rate,
        "settled_at": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.loans.insert_one(doc)
    doc.pop('_id', None)
    return serialize_loan(doc, 0)


@api_router.put("/loans/{loan_id}")
async def update_loan(loan_id: str, loan: LoanCreate, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    loan_date = loan.date
    if loan_date.tzinfo is None:
        loan_date = loan_date.replace(tzinfo=timezone.utc)
    result = await db.loans.update_one(
        {"loan_id": loan_id, "user_id": user['user_id']},
        {"$set": {
            "person_name": loan.person_name,
            "description": loan.description,
            "amount_enc": encrypt_field(loan.amount),
            "date": loan_date,
            "monthly_interest_rate": loan.monthly_interest_rate,
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Loan not found")
    updated = await db.loans.find_one({"loan_id": loan_id})
    paid = await _loan_total_paid(user['user_id'], loan_id)
    return serialize_loan(updated, paid)


@api_router.delete("/loans/{loan_id}")
async def delete_loan(loan_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    await db.loan_payments.delete_many({"loan_id": loan_id, "user_id": user['user_id']})
    result = await db.loans.delete_one({"loan_id": loan_id, "user_id": user['user_id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Loan not found")
    return {"message": "Loan deleted"}


@api_router.get("/loans/{loan_id}/payments")
async def get_loan_payments(loan_id: str, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    payments = await db.loan_payments.find(
        {"loan_id": loan_id, "user_id": user['user_id']}
    ).sort('date', -1).to_list(2000)
    return [serialize_loan_payment(p) for p in payments]


@api_router.post("/loans/{loan_id}/pay")
async def pay_loan(loan_id: str, payment: LoanPaymentCreate, authorization: Optional[str] = Header(None)):
    """Registra un pago (total o parcial) recibido de la persona que debe."""
    user = await get_current_user(authorization)
    loan = await db.loans.find_one({"loan_id": loan_id, "user_id": user['user_id']})
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    p_date = payment.date
    if p_date.tzinfo is None:
        p_date = p_date.replace(tzinfo=timezone.utc)

    await db.loan_payments.insert_one({
        "payment_id": f"lpay_{uuid.uuid4().hex[:12]}",
        "user_id": user['user_id'],
        "loan_id": loan_id,
        "amount_enc": encrypt_field(payment.amount),
        "note": payment.note,
        "date": p_date,
    })

    paid = await _loan_total_paid(user['user_id'], loan_id)
    principal = decrypt_field(loan['amount_enc'])
    loan_date = loan['date']
    interest = _loan_interest_accrued(principal, loan.get('monthly_interest_rate'), loan_date)
    total_owed = principal + interest
    if paid >= total_owed and not loan.get('settled_at'):
        await db.loans.update_one({"loan_id": loan_id}, {"$set": {"settled_at": datetime.now(timezone.utc)}})
        loan = await db.loans.find_one({"loan_id": loan_id})

    return serialize_loan(loan, paid)


@api_router.delete("/loan-payments/{payment_id}")
async def delete_loan_payment(payment_id: str, authorization: Optional[str] = Header(None)):
    """Deshace un pago cargado por error."""
    user = await get_current_user(authorization)
    payment = await db.loan_payments.find_one({"payment_id": payment_id, "user_id": user['user_id']})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    await db.loan_payments.delete_one({"payment_id": payment_id})

    loan = await db.loans.find_one({"loan_id": payment['loan_id']})
    if loan:
        paid = await _loan_total_paid(user['user_id'], payment['loan_id'])
        principal = decrypt_field(loan['amount_enc'])
        interest = _loan_interest_accrued(principal, loan.get('monthly_interest_rate'), loan['date'])
        total_owed = principal + interest
        if paid < total_owed and loan.get('settled_at'):
            await db.loans.update_one({"loan_id": payment['loan_id']}, {"$set": {"settled_at": None}})

    return {"message": "Payment deleted"}


# ==================== ANALYTICS ROUTES ====================

@api_router.get("/analytics/dashboard")
async def get_dashboard(period: str = 'month', month: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    await generate_due_recurring(user['user_id'])
    now = datetime.now(timezone.utc)

    if month:
        year, mo = month.split('-')
        start_date = datetime(int(year), int(mo), 1, tzinfo=timezone.utc)
        end_date = datetime(int(year) + 1, 1, 1, tzinfo=timezone.utc) if int(mo) == 12 else datetime(int(year), int(mo) + 1, 1, tzinfo=timezone.utc)
        period_str = start_date.strftime('%B %Y')
    elif period == 'day':
        start_date = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        end_date = start_date + timedelta(days=1)
        period_str = start_date.strftime('%d/%m/%Y')
    elif period == 'week':
        start_date = now - timedelta(days=now.weekday())
        start_date = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
        end_date = start_date + timedelta(days=7)
        period_str = f"Semana {start_date.strftime('%d/%m')}"
    else:
        start_date = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        end_date = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc) if now.month == 12 else datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
        period_str = start_date.strftime('%B %Y')

    txns = await db.transactions.find({
        "user_id": user['user_id'],
        "date": {"$gte": start_date, "$lt": end_date}
    }).to_list(10000)

    total_income = sum(decrypt_field(t['amount_enc']) for t in txns if t['type'] == 'income')
    total_expenses = sum(decrypt_field(t['amount_enc']) for t in txns if t['type'] == 'expense')
    total_savings = sum(decrypt_field(t['amount_enc']) for t in txns if t['type'] == 'saving')

    # Las compras con tarjeta no se cargan como Movimientos (se agregan
    # directo en Tarjetas); cuando pagás el resumen de un mes, esa parte
    # tildada para incluir se suma acá, en la torta de ESE mes (no del mes
    # en que tocaste el botón).
    card_total = await _card_payment_included_totals(user['user_id'], start_date.strftime('%Y-%m'))
    total_expenses += card_total

    # Igual que las tarjetas: los gastos de la Cuenta Super se van
    # acumulando sin sumar a la torta hasta que registrás un pago — recién
    # ahí entra el NETO (pagado menos reintegro) al mes en que pagaste.
    super_total = await _super_account_included_total(user['user_id'], start_date.strftime('%Y-%m'))
    total_expenses += super_total

    # Ahorro total histórico (todos los movimientos de tipo Ahorro, sin
    # filtrar por el período seleccionado) — es el "cuánto ahorraste en total".
    all_saving_txns = await db.transactions.find({
        "user_id": user['user_id'], "type": "saving"
    }).to_list(10000)
    total_savings_all_time = sum(decrypt_field(t['amount_enc']) for t in all_saving_txns)

    investments = await db.investments.find({"user_id": user['user_id']}).to_list(1000)
    total_investments = sum(
        decrypt_field(i['quantity_enc']) * decrypt_field(i['current_price_enc'])
        for i in investments
    )

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_savings": total_savings,
        "total_savings_all_time": total_savings_all_time,
        "total_investments": total_investments,
        "balance": total_income - total_expenses,
        "period": period_str,
    }


@api_router.get("/analytics/expenses-by-category")
async def get_expenses_by_category(period: str = 'month', month: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    now = datetime.now(timezone.utc)

    if month:
        year, mo = month.split('-')
        start_date = datetime(int(year), int(mo), 1, tzinfo=timezone.utc)
        end_date = datetime(int(year) + 1, 1, 1, tzinfo=timezone.utc) if int(mo) == 12 else datetime(int(year), int(mo) + 1, 1, tzinfo=timezone.utc)
    elif period == 'day':
        start_date = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        end_date = start_date + timedelta(days=1)
    elif period == 'week':
        start_date = now - timedelta(days=now.weekday())
        start_date = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
        end_date = start_date + timedelta(days=7)
    else:
        start_date = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        end_date = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc) if now.month == 12 else datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

    expenses = await db.transactions.find({
        "user_id": user['user_id'],
        "type": "expense",
        "date": {"$gte": start_date, "$lt": end_date}
    }).to_list(10000)

    totals = {}
    grand_total = 0
    for e in expenses:
        amt = decrypt_field(e['amount_enc'])
        totals[e['category']] = totals.get(e['category'], 0) + amt
        grand_total += amt

    # Sumar, como una sola categoría "Tarjeta", lo que se pagó de resumen
    # de este mes (solo la parte tildada para incluir en el dashboard),
    # sin desglosar en las categorías internas de cada compra — pero sí
    # detallando cuánto corresponde a cada tarjeta puntual.
    target_month = month or start_date.strftime('%Y-%m')
    card_total, card_breakdown = await _card_payment_breakdown(user['user_id'], target_month)
    if card_total > 0:
        totals[CARD_SUMMARY_CATEGORY] = totals.get(CARD_SUMMARY_CATEGORY, 0) + card_total
        grand_total += card_total

    # Igual que con las tarjetas: la Cuenta Super solo entra a la torta el
    # mes en que se paga, y por el monto NETO (pagado menos reintegro).
    super_total = await _super_account_included_total(user['user_id'], target_month)
    if super_total > 0:
        totals[SUPER_ACCOUNT_CATEGORY] = totals.get(SUPER_ACCOUNT_CATEGORY, 0) + super_total
        grand_total += super_total

    result = []
    for cat, amt in totals.items():
        entry = {"category": cat, "total": amt, "percentage": (amt / grand_total * 100) if grand_total > 0 else 0}
        if cat == CARD_SUMMARY_CATEGORY and card_breakdown:
            entry["description"] = " · ".join(f"{b['card_name']}: {_fmt_ars(b['amount'])}" for b in card_breakdown)
            entry["card_breakdown"] = card_breakdown
        result.append(entry)
    return sorted(result, key=lambda x: x['total'], reverse=True)


@api_router.get("/analytics/trends")
async def get_trends(months: int = 6, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    now = datetime.now(timezone.utc)
    trends = []

    for i in range(months):
        month_offset = months - i - 1
        target_month = now.month - month_offset
        target_year = now.year
        while target_month <= 0:
            target_month += 12
            target_year -= 1

        start_date = datetime(target_year, target_month, 1, tzinfo=timezone.utc)
        end_date = datetime(target_year + 1, 1, 1, tzinfo=timezone.utc) if target_month == 12 else datetime(target_year, target_month + 1, 1, tzinfo=timezone.utc)
        label = start_date.strftime('%b %Y')

        txns = await db.transactions.find({
            "user_id": user['user_id'],
            "date": {"$gte": start_date, "$lt": end_date}
        }).to_list(10000)

        income = sum(decrypt_field(t['amount_enc']) for t in txns if t['type'] == 'income')
        expenses = sum(decrypt_field(t['amount_enc']) for t in txns if t['type'] == 'expense')

        trends.append({
            "period": label,
            "month": f"{target_year}-{target_month:02d}",
            "income": income,
            "expenses": expenses,
            "balance": income - expenses,
        })

    return trends


@api_router.get("/analytics/available-months")
async def get_available_months(authorization: Optional[str] = Header(None)):
    """Get list of months that have transactions for the historical selector"""
    user = await get_current_user(authorization)
    pipeline = [
        {"$match": {"user_id": user['user_id']}},
        {"$group": {
            "_id": {
                "year": {"$year": "$date"},
                "month": {"$month": "$date"}
            }
        }},
        {"$sort": {"_id.year": -1, "_id.month": -1}}
    ]
    result = await db.transactions.aggregate(pipeline).to_list(200)
    months = [
        f"{r['_id']['year']}-{r['_id']['month']:02d}"
        for r in result
    ]
    # Always include current month
    current_month = datetime.now(timezone.utc).strftime('%Y-%m')
    if current_month not in months:
        months.insert(0, current_month)
    return months


# ==================== BACKUP ROUTES ====================

@api_router.get("/backup/export")
async def export_backup(authorization: Optional[str] = Header(None)):
    """Export all user data as a decrypted JSON (client should re-encrypt if needed).
    The backup includes all financial data associated with the user account."""
    user = await get_current_user(authorization)
    uid = user['user_id']

    transactions = await db.transactions.find({"user_id": uid}).to_list(100000)
    investments = await db.investments.find({"user_id": uid}).to_list(10000)
    budgets = await db.budgets.find({"user_id": uid}).to_list(10000)
    categories = await db.categories.find({"user_id": uid}, {"_id": 0}).to_list(1000)

    backup = {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user": {"email": user['email'], "name": user['name']},
        "transactions": [serialize_transaction(t) for t in transactions],
        "investments": [serialize_investment(i) for i in investments],
        "budgets": [serialize_budget(b) for b in budgets],
        "categories": categories,
    }

    # Encrypt the whole backup blob so exported file is not plaintext
    encrypted_blob = cipher.encrypt(json.dumps(backup).encode()).decode()

    return {
        "encrypted_backup": encrypted_blob,
        "exported_at": backup['exported_at'],
        "counts": {
            "transactions": len(backup['transactions']),
            "investments": len(backup['investments']),
            "budgets": len(backup['budgets']),
            "categories": len(backup['categories']),
        }
    }


# ==================== STARTUP ====================

async def _migrate_grandfather_paid_installments():
    """
    Migración única (idempotente): las compras cargadas ANTES de que
    existiera el seguimiento de cuotas atado a pagos reales avanzaban de
    cuota solo por el calendario, sin depender de haber tocado "Pagué el
    resumen". Al activar el nuevo sistema, esas compras de golpe se ven
    como "0 cuotas pagadas" y retroceden a Cuota 1 — para evitar eso, acá
    se congela una única vez, por compra, la posición que ya tenían bajo
    el sistema viejo (cuotas 1..N-1 se dan por resueltas, la cuota N sigue
    como la corriente, tal como ya la venía mostrando la app). De ahí en
    más, esa compra sigue avanzando solo con pagos reales, igual que
    cualquier compra nueva.
    """
    cursor = db.card_expenses.find({"migrated_grandfather_paid": {"$exists": False}})
    async for exp in cursor:
        card = await db.credit_cards.find_one({"card_id": exp['card_id']})
        closing_day = card.get('closing_day', 1) if card else 1
        installments = exp.get('installments', 1)
        purchase_date = exp['purchase_date']
        if purchase_date.tzinfo is None:
            purchase_date = purchase_date.replace(tzinfo=timezone.utc)

        if exp.get('manually_closed'):
            baseline = installments
        else:
            now = datetime.now(timezone.utc)
            purchase_cycle = _statement_cycle(purchase_date, closing_day)
            current_cycle = _statement_cycle(now, closing_day)
            months_elapsed = (current_cycle[0] - purchase_cycle[0]) * 12 + (current_cycle[1] - purchase_cycle[1])
            old_current = min(installments, max(1, months_elapsed + 1))
            baseline = max(0, old_current - 1)

        await db.card_expenses.update_one(
            {"expense_id": exp['expense_id']},
            {"$set": {"migrated_grandfather_paid": baseline}}
        )


async def _migrate_super_account_expenses_from_transactions():
    """
    Migración única (naturalmente idempotente): mueve los movimientos que
    ya estaban cargados con la categoría "Cuenta Super" (desde antes de
    que existiera esta sección) a la nueva cuenta corriente del súper,
    para que queden organizados ahí en vez de mezclados en Movimientos.

    El nombre de la categoría se compara SIN IMPORTAR mayúsculas/minúsculas
    ("Cuenta Super", "Cuenta super", "cuenta super" cuentan igual) — así no
    depende de con qué mayúsculas la haya escrito cada usuario al crearla.

    Solo migra desde el mes en que se activó esta sección en adelante
    (SUPER_ACCOUNT_MIGRATION_CUTOFF) — así los meses anteriores (ej:
    agosto) NO se tocan y la torta de esos meses queda exactamente como
    ya la habías visto. De acá en más, los movimientos nuevos con esa
    categoría ya no se crean en "transactions" (van directo a la cuenta
    corriente), así que no hay nada más que migrar después de la primera
    corrida.
    """
    category_pattern = re.compile(f"^{re.escape(SUPER_ACCOUNT_CATEGORY)}$", re.IGNORECASE)
    cursor = db.transactions.find({
        "category": category_pattern,
        "type": "expense",
        "date": {"$gte": SUPER_ACCOUNT_MIGRATION_CUTOFF},
    })
    async for txn in cursor:
        amount = decrypt_field(txn['amount_enc'])
        description = decrypt_field(txn['description_enc']) if txn.get('description_enc') else 'Compra del súper'
        doc = {
            "expense_id": f"sexp_{uuid.uuid4().hex[:12]}",
            "user_id": txn['user_id'],
            "description": description or 'Compra del súper',
            "amount_enc": encrypt_field(amount),
            "date": txn['date'],
        }
        await db.super_account_expenses.insert_one(doc)
        await db.transactions.delete_one({"transaction_id": txn['transaction_id']})


async def _migrate_backfill_contribution_transactions():
    """
    Migración única (idempotente): los aportes a metas de ahorro hechos
    ANTES de este cambio se guardaban solo como "aporte" (savings_contributions),
    sin un movimiento equivalente — por eso no contaban en el "Ahorro" del
    Dashboard, que se calcula sumando movimientos. Acá se crea, una sola
    vez, el movimiento que le faltaba a cada aporte viejo (los que no
    tienen todavía un transaction_id vinculado), para que ese ahorro ya
    aportado empiece a contar en el Dashboard sin tener que volver a
    cargarlo a mano.
    """
    cursor = db.savings_contributions.find({"transaction_id": {"$exists": False}})
    async for contrib in cursor:
        goal = await db.savings_goals.find_one({"goal_id": contrib['goal_id']})
        category = goal['name'] if goal else 'Ahorro'
        amount = decrypt_field(contrib['amount_enc'])
        note = contrib.get('note') or f"Aporte a {category}"
        c_date = contrib['date']
        if c_date.tzinfo is None:
            c_date = c_date.replace(tzinfo=timezone.utc)

        txn_doc = {
            "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
            "user_id": contrib['user_id'],
            "type": "saving",
            "amount_enc": encrypt_field(amount),
            "category": category,
            "description_enc": encrypt_field(note),
            "date": c_date,
            "created_at": datetime.now(timezone.utc),
            "goal_id": contrib['goal_id'],
        }
        await db.transactions.insert_one(txn_doc)
        await db.savings_contributions.update_one(
            {"contribution_id": contrib['contribution_id']},
            {"$set": {"transaction_id": txn_doc['transaction_id']}}
        )


@app.on_event("startup")
async def startup_event():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.transactions.create_index("user_id")
    await db.transactions.create_index("transaction_id", unique=True)
    await db.categories.create_index("user_id")
    await db.categories.create_index("category_id", unique=True)
    await db.budgets.create_index("user_id")
    await db.budgets.create_index("budget_id", unique=True)
    await db.investments.create_index("user_id")
    await db.investments.create_index("investment_id", unique=True)
    await _migrate_grandfather_paid_installments()
    await _migrate_super_account_expenses_from_transactions()
    await _migrate_backfill_contribution_transactions()


# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
