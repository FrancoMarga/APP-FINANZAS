from fastapi import FastAPI, APIRouter, HTTPException, Header, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Any
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from cryptography.fernet import Fernet
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
import httpx
import uuid
import base64
import json

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


class BudgetCreate(BaseModel):
    category: str
    monthly_limit: float
    alert_threshold: float = 80.0
    month: str


class InvestmentCreate(BaseModel):
    name: str
    type: Literal['crypto', 'stock', 'other']
    quantity: float
    purchase_price: float
    current_price: float
    coin_id: Optional[str] = None  # CoinGecko ID for auto-sync
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

@api_router.get("/transactions")
async def get_transactions(
    type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    month: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    user = await get_current_user(authorization)
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
    }
    await db.transactions.insert_one(doc)

    # Auto-update budget if expense
    if transaction.type == 'expense':
        month = txn_date.strftime('%Y-%m')
        await recompute_budget_spent(user['user_id'], transaction.category, month)

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
        }}
    )

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

    # Recompute budget if it was an expense
    if old['type'] == 'expense':
        old_date = old['date'] if isinstance(old['date'], datetime) else datetime.fromisoformat(old['date'])
        if old_date.tzinfo is None:
            old_date = old_date.replace(tzinfo=timezone.utc)
        await recompute_budget_spent(user['user_id'], old['category'], old_date.strftime('%Y-%m'))

    return {"message": "Transaction deleted"}


# ==================== BUDGET ROUTES ====================

@api_router.get("/budgets")
async def get_budgets(month: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    query = {"user_id": user['user_id']}
    query['month'] = month or datetime.now(timezone.utc).strftime('%Y-%m')
    budgets = await db.budgets.find(query).to_list(1000)
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


# ==================== ANALYTICS ROUTES ====================

@api_router.get("/analytics/dashboard")
async def get_dashboard(period: str = 'month', month: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
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

    investments = await db.investments.find({"user_id": user['user_id']}).to_list(1000)
    total_investments = sum(
        decrypt_field(i['quantity_enc']) * decrypt_field(i['current_price_enc'])
        for i in investments
    )

    return {
        "total_income": total_income,
        "total_expenses": total_expenses,
        "total_savings": total_savings,
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

    result = [
        {"category": cat, "total": amt, "percentage": (amt / grand_total * 100) if grand_total > 0 else 0}
        for cat, amt in totals.items()
    ]
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
