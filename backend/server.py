from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timedelta
from bson import ObjectId

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Helper function to convert ObjectId to string
def serialize_doc(doc):
    if doc and '_id' in doc:
        doc['_id'] = str(doc['_id'])
    return doc

# ==================== MODELS ====================

class CategoryCreate(BaseModel):
    name: str
    type: Literal['expense', 'income', 'investment']
    icon: str = "wallet"
    color: str = "#6366F1"
    is_custom: bool = True

class Category(CategoryCreate):
    id: str = Field(alias="_id")

    class Config:
        populate_by_name = True

class TransactionCreate(BaseModel):
    type: Literal['expense', 'income', 'saving']
    amount: float
    category: str
    description: str = ""
    date: datetime = Field(default_factory=datetime.now)

class Transaction(TransactionCreate):
    id: str = Field(alias="_id")
    created_at: datetime = Field(default_factory=datetime.now)

    class Config:
        populate_by_name = True

class BudgetCreate(BaseModel):
    category: str
    monthly_limit: float
    alert_threshold: float = 80.0  # Percentage
    month: str  # Format: YYYY-MM

class Budget(BudgetCreate):
    id: str = Field(alias="_id")
    current_spent: float = 0.0

    class Config:
        populate_by_name = True

class InvestmentCreate(BaseModel):
    name: str
    type: Literal['crypto', 'stock', 'other']
    quantity: float
    purchase_price: float
    current_price: float
    date: datetime = Field(default_factory=datetime.now)

class Investment(InvestmentCreate):
    id: str = Field(alias="_id")

    class Config:
        populate_by_name = True

class DashboardSummary(BaseModel):
    total_income: float
    total_expenses: float
    total_savings: float
    total_investments: float
    balance: float
    period: str

class ExpenseByCategory(BaseModel):
    category: str
    total: float
    percentage: float

# ==================== INITIALIZE DEFAULT CATEGORIES ====================

async def initialize_categories():
    """Initialize predefined categories if they don't exist"""
    count = await db.categories.count_documents({})
    if count == 0:
        default_categories = [
            # Expense categories
            {"name": "Comida", "type": "expense", "icon": "restaurant", "color": "#EF4444", "is_custom": False},
            {"name": "Transporte", "type": "expense", "icon": "car", "color": "#F59E0B", "is_custom": False},
            {"name": "Vivienda", "type": "expense", "icon": "home", "color": "#8B5CF6", "is_custom": False},
            {"name": "Entretenimiento", "type": "expense", "icon": "game-controller", "color": "#EC4899", "is_custom": False},
            {"name": "Salud", "type": "expense", "icon": "medkit", "color": "#10B981", "is_custom": False},
            {"name": "Educación", "type": "expense", "icon": "school", "color": "#3B82F6", "is_custom": False},
            {"name": "Compras", "type": "expense", "icon": "cart", "color": "#F97316", "is_custom": False},
            {"name": "Servicios", "type": "expense", "icon": "construct", "color": "#6366F1", "is_custom": False},
            {"name": "Otros Gastos", "type": "expense", "icon": "ellipsis-horizontal", "color": "#6B7280", "is_custom": False},
            # Income categories
            {"name": "Salario", "type": "income", "icon": "cash", "color": "#10B981", "is_custom": False},
            {"name": "Freelance", "type": "income", "icon": "laptop", "color": "#3B82F6", "is_custom": False},
            {"name": "Inversiones", "type": "income", "icon": "trending-up", "color": "#8B5CF6", "is_custom": False},
            {"name": "Otros Ingresos", "type": "income", "icon": "add-circle", "color": "#10B981", "is_custom": False},
        ]
        await db.categories.insert_many(default_categories)

@app.on_event("startup")
async def startup_event():
    await initialize_categories()

# ==================== CATEGORY ROUTES ====================

@api_router.get("/categories", response_model=List[Category])
async def get_categories(type: Optional[str] = None):
    """Get all categories, optionally filtered by type"""
    query = {}
    if type:
        query['type'] = type
    categories = await db.categories.find(query).to_list(1000)
    return [Category(**serialize_doc(cat)) for cat in categories]

@api_router.post("/categories", response_model=Category)
async def create_category(category: CategoryCreate):
    """Create a new custom category"""
    category_dict = category.model_dump()
    result = await db.categories.insert_one(category_dict)
    category_dict['_id'] = str(result.inserted_id)
    return Category(**category_dict)

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    """Delete a custom category"""
    category = await db.categories.find_one({"_id": ObjectId(category_id)})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if not category.get('is_custom', False):
        raise HTTPException(status_code=400, detail="Cannot delete predefined categories")
    await db.categories.delete_one({"_id": ObjectId(category_id)})
    return {"message": "Category deleted successfully"}

# ==================== TRANSACTION ROUTES ====================

@api_router.get("/transactions", response_model=List[Transaction])
async def get_transactions(
    type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category: Optional[str] = None
):
    """Get all transactions with optional filters"""
    query = {}
    if type:
        query['type'] = type
    if category:
        query['category'] = category
    if start_date and end_date:
        query['date'] = {
            '$gte': datetime.fromisoformat(start_date.replace('Z', '+00:00')),
            '$lte': datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        }
    
    transactions = await db.transactions.find(query).sort('date', -1).to_list(1000)
    return [Transaction(**serialize_doc(t)) for t in transactions]

@api_router.post("/transactions", response_model=Transaction)
async def create_transaction(transaction: TransactionCreate):
    """Create a new transaction"""
    transaction_dict = transaction.model_dump()
    result = await db.transactions.insert_one(transaction_dict)
    transaction_dict['_id'] = str(result.inserted_id)
    transaction_dict['created_at'] = datetime.now()
    
    # Update budget if it's an expense
    if transaction.type == 'expense':
        month = transaction.date.strftime('%Y-%m')
        budget = await db.budgets.find_one({
            'category': transaction.category,
            'month': month
        })
        if budget:
            new_spent = budget.get('current_spent', 0) + transaction.amount
            await db.budgets.update_one(
                {'_id': budget['_id']},
                {'$set': {'current_spent': new_spent}}
            )
    
    return Transaction(**transaction_dict)

@api_router.put("/transactions/{transaction_id}", response_model=Transaction)
async def update_transaction(transaction_id: str, transaction: TransactionCreate):
    """Update a transaction"""
    transaction_dict = transaction.model_dump()
    result = await db.transactions.update_one(
        {"_id": ObjectId(transaction_id)},
        {"$set": transaction_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    updated = await db.transactions.find_one({"_id": ObjectId(transaction_id)})
    return Transaction(**serialize_doc(updated))

@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str):
    """Delete a transaction"""
    result = await db.transactions.delete_one({"_id": ObjectId(transaction_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"message": "Transaction deleted successfully"}

# ==================== BUDGET ROUTES ====================

@api_router.get("/budgets", response_model=List[Budget])
async def get_budgets(month: Optional[str] = None):
    """Get all budgets, optionally for a specific month"""
    query = {}
    if month:
        query['month'] = month
    else:
        # Default to current month
        query['month'] = datetime.now().strftime('%Y-%m')
    
    budgets = await db.budgets.find(query).to_list(1000)
    return [Budget(**serialize_doc(b)) for b in budgets]

@api_router.post("/budgets", response_model=Budget)
async def create_budget(budget: BudgetCreate):
    """Create a new budget"""
    # Check if budget already exists for this category and month
    existing = await db.budgets.find_one({
        'category': budget.category,
        'month': budget.month
    })
    if existing:
        raise HTTPException(status_code=400, detail="Budget already exists for this category and month")
    
    # Calculate current spent for the month
    start_date = datetime.strptime(budget.month, '%Y-%m')
    if start_date.month == 12:
        end_date = datetime(start_date.year + 1, 1, 1)
    else:
        end_date = datetime(start_date.year, start_date.month + 1, 1)
    
    expenses = await db.transactions.find({
        'type': 'expense',
        'category': budget.category,
        'date': {'$gte': start_date, '$lt': end_date}
    }).to_list(1000)
    
    current_spent = sum(e['amount'] for e in expenses)
    
    budget_dict = budget.model_dump()
    budget_dict['current_spent'] = current_spent
    result = await db.budgets.insert_one(budget_dict)
    budget_dict['_id'] = str(result.inserted_id)
    return Budget(**budget_dict)

@api_router.put("/budgets/{budget_id}", response_model=Budget)
async def update_budget(budget_id: str, budget: BudgetCreate):
    """Update a budget"""
    budget_dict = budget.model_dump()
    result = await db.budgets.update_one(
        {"_id": ObjectId(budget_id)},
        {"$set": budget_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    updated = await db.budgets.find_one({"_id": ObjectId(budget_id)})
    return Budget(**serialize_doc(updated))

@api_router.delete("/budgets/{budget_id}")
async def delete_budget(budget_id: str):
    """Delete a budget"""
    result = await db.budgets.delete_one({"_id": ObjectId(budget_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"message": "Budget deleted successfully"}

@api_router.get("/budgets/alerts")
async def get_budget_alerts():
    """Get budgets that have exceeded their alert threshold"""
    month = datetime.now().strftime('%Y-%m')
    budgets = await db.budgets.find({'month': month}).to_list(1000)
    
    alerts = []
    for budget in budgets:
        percentage = (budget['current_spent'] / budget['monthly_limit']) * 100
        if percentage >= budget['alert_threshold']:
            alerts.append({
                'category': budget['category'],
                'spent': budget['current_spent'],
                'limit': budget['monthly_limit'],
                'percentage': percentage
            })
    
    return alerts

# ==================== INVESTMENT ROUTES ====================

@api_router.get("/investments", response_model=List[Investment])
async def get_investments():
    """Get all investments"""
    investments = await db.investments.find().sort('date', -1).to_list(1000)
    return [Investment(**serialize_doc(i)) for i in investments]

@api_router.post("/investments", response_model=Investment)
async def create_investment(investment: InvestmentCreate):
    """Create a new investment"""
    investment_dict = investment.model_dump()
    result = await db.investments.insert_one(investment_dict)
    investment_dict['_id'] = str(result.inserted_id)
    return Investment(**investment_dict)

@api_router.put("/investments/{investment_id}", response_model=Investment)
async def update_investment(investment_id: str, investment: InvestmentCreate):
    """Update an investment"""
    investment_dict = investment.model_dump()
    result = await db.investments.update_one(
        {"_id": ObjectId(investment_id)},
        {"$set": investment_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Investment not found")
    
    updated = await db.investments.find_one({"_id": ObjectId(investment_id)})
    return Investment(**serialize_doc(updated))

@api_router.delete("/investments/{investment_id}")
async def delete_investment(investment_id: str):
    """Delete an investment"""
    result = await db.investments.delete_one({"_id": ObjectId(investment_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Investment not found")
    return {"message": "Investment deleted successfully"}

@api_router.get("/investments/total")
async def get_investments_total():
    """Get total investment value and profit/loss"""
    investments = await db.investments.find().to_list(1000)
    
    total_invested = sum(i['quantity'] * i['purchase_price'] for i in investments)
    total_current = sum(i['quantity'] * i['current_price'] for i in investments)
    profit_loss = total_current - total_invested
    profit_loss_percentage = (profit_loss / total_invested * 100) if total_invested > 0 else 0
    
    return {
        'total_invested': total_invested,
        'total_current_value': total_current,
        'profit_loss': profit_loss,
        'profit_loss_percentage': profit_loss_percentage
    }

# ==================== ANALYTICS ROUTES ====================

@api_router.get("/analytics/dashboard", response_model=DashboardSummary)
async def get_dashboard(period: str = 'month'):
    """Get dashboard summary for the specified period"""
    now = datetime.now()
    
    if period == 'day':
        start_date = datetime(now.year, now.month, now.day)
        end_date = start_date + timedelta(days=1)
        period_str = start_date.strftime('%d/%m/%Y')
    elif period == 'week':
        start_date = now - timedelta(days=now.weekday())
        start_date = datetime(start_date.year, start_date.month, start_date.day)
        end_date = start_date + timedelta(days=7)
        period_str = f"Semana {start_date.strftime('%d/%m')}"
    else:  # month
        start_date = datetime(now.year, now.month, 1)
        if now.month == 12:
            end_date = datetime(now.year + 1, 1, 1)
        else:
            end_date = datetime(now.year, now.month + 1, 1)
        period_str = start_date.strftime('%B %Y')
    
    # Get transactions for the period
    transactions = await db.transactions.find({
        'date': {'$gte': start_date, '$lt': end_date}
    }).to_list(10000)
    
    total_income = sum(t['amount'] for t in transactions if t['type'] == 'income')
    total_expenses = sum(t['amount'] for t in transactions if t['type'] == 'expense')
    total_savings = sum(t['amount'] for t in transactions if t['type'] == 'saving')
    
    # Get investments total
    investments = await db.investments.find().to_list(1000)
    total_investments = sum(i['quantity'] * i['current_price'] for i in investments)
    
    balance = total_income - total_expenses
    
    return DashboardSummary(
        total_income=total_income,
        total_expenses=total_expenses,
        total_savings=total_savings,
        total_investments=total_investments,
        balance=balance,
        period=period_str
    )

@api_router.get("/analytics/expenses-by-category", response_model=List[ExpenseByCategory])
async def get_expenses_by_category(period: str = 'month'):
    """Get expenses grouped by category"""
    now = datetime.now()
    
    if period == 'day':
        start_date = datetime(now.year, now.month, now.day)
        end_date = start_date + timedelta(days=1)
    elif period == 'week':
        start_date = now - timedelta(days=now.weekday())
        start_date = datetime(start_date.year, start_date.month, start_date.day)
        end_date = start_date + timedelta(days=7)
    else:  # month
        start_date = datetime(now.year, now.month, 1)
        if now.month == 12:
            end_date = datetime(now.year + 1, 1, 1)
        else:
            end_date = datetime(now.year, now.month + 1, 1)
    
    expenses = await db.transactions.find({
        'type': 'expense',
        'date': {'$gte': start_date, '$lt': end_date}
    }).to_list(10000)
    
    # Group by category
    category_totals = {}
    total = 0
    for expense in expenses:
        category = expense['category']
        amount = expense['amount']
        category_totals[category] = category_totals.get(category, 0) + amount
        total += amount
    
    # Calculate percentages
    result = []
    for category, amount in category_totals.items():
        percentage = (amount / total * 100) if total > 0 else 0
        result.append(ExpenseByCategory(
            category=category,
            total=amount,
            percentage=percentage
        ))
    
    return sorted(result, key=lambda x: x.total, reverse=True)

@api_router.get("/analytics/trends")
async def get_trends(period: str = 'month', months: int = 6):
    """Get expense and income trends over time"""
    now = datetime.now()
    trends = []
    
    for i in range(months):
        if period == 'month':
            month_offset = months - i - 1
            if now.month - month_offset <= 0:
                year = now.year - 1
                month = 12 + (now.month - month_offset)
            else:
                year = now.year
                month = now.month - month_offset
            
            start_date = datetime(year, month, 1)
            if month == 12:
                end_date = datetime(year + 1, 1, 1)
            else:
                end_date = datetime(year, month + 1, 1)
            
            label = start_date.strftime('%b %Y')
        
        transactions = await db.transactions.find({
            'date': {'$gte': start_date, '$lt': end_date}
        }).to_list(10000)
        
        income = sum(t['amount'] for t in transactions if t['type'] == 'income')
        expenses = sum(t['amount'] for t in transactions if t['type'] == 'expense')
        
        trends.append({
            'period': label,
            'income': income,
            'expenses': expenses,
            'balance': income - expenses
        })
    
    return trends

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
