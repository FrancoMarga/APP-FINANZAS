#!/usr/bin/env python3
"""
Backend API Testing for Personal Finance App
Tests all endpoints in the order specified in the review request
"""

import requests
import json
from datetime import datetime
from typing import Dict, Any, List

# Backend URL from frontend/.env
BASE_URL = "https://wealth-planner-190.preview.emergentagent.com/api"

# Test results tracking
test_results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def log_test(test_name: str, passed: bool, message: str = "", data: Any = None):
    """Log test result"""
    result = {
        "test": test_name,
        "message": message,
        "data": data
    }
    if passed:
        test_results["passed"].append(result)
        print(f"✅ PASS: {test_name}")
        if message:
            print(f"   {message}")
    else:
        test_results["failed"].append(result)
        print(f"❌ FAIL: {test_name}")
        print(f"   {message}")
        if data:
            print(f"   Data: {json.dumps(data, indent=2)}")

def log_warning(test_name: str, message: str):
    """Log warning"""
    test_results["warnings"].append({"test": test_name, "message": message})
    print(f"⚠️  WARNING: {test_name} - {message}")

# Store IDs for later tests
created_ids = {
    "category": None,
    "transactions": [],
    "budget": None,
    "investments": []
}

print("=" * 80)
print("BACKEND API TESTING - Personal Finance App")
print("=" * 80)
print(f"Base URL: {BASE_URL}")
print("=" * 80)

# ==================== 1. CATEGORÍAS ====================
print("\n" + "=" * 80)
print("1. TESTING CATEGORÍAS")
print("=" * 80)

# Test 1.1: GET /api/categories - debe retornar 13 categorías predefinidas
print("\n[1.1] GET /api/categories - Obtener todas las categorías")
try:
    response = requests.get(f"{BASE_URL}/categories", timeout=10)
    if response.status_code == 200:
        categories = response.json()
        if len(categories) == 13:
            log_test("GET /api/categories", True, f"Retornó {len(categories)} categorías predefinidas")
        else:
            log_test("GET /api/categories", False, f"Se esperaban 13 categorías, se obtuvieron {len(categories)}")
        
        # Verify structure
        if categories and all(key in categories[0] for key in ['_id', 'name', 'type', 'icon', 'color']):
            log_test("Categories structure", True, "Estructura correcta con todos los campos requeridos")
        else:
            log_test("Categories structure", False, "Estructura incorrecta o campos faltantes")
    else:
        log_test("GET /api/categories", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/categories", False, f"Exception: {str(e)}")

# Test 1.2: POST /api/categories - crear categoría custom "Mascotas"
print("\n[1.2] POST /api/categories - Crear categoría custom 'Mascotas'")
try:
    new_category = {
        "name": "Mascotas",
        "type": "expense",
        "icon": "paw",
        "color": "#F59E0B",
        "is_custom": True
    }
    response = requests.post(f"{BASE_URL}/categories", json=new_category, timeout=10)
    if response.status_code in [200, 201]:
        category_data = response.json()
        created_ids["category"] = category_data.get("_id")
        log_test("POST /api/categories", True, f"Categoría 'Mascotas' creada con ID: {created_ids['category']}")
    else:
        log_test("POST /api/categories", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("POST /api/categories", False, f"Exception: {str(e)}")

# Test 1.3: GET /api/categories?type=expense - filtrar solo gastos
print("\n[1.3] GET /api/categories?type=expense - Filtrar categorías de gastos")
try:
    response = requests.get(f"{BASE_URL}/categories?type=expense", timeout=10)
    if response.status_code == 200:
        expense_categories = response.json()
        if all(cat['type'] == 'expense' for cat in expense_categories):
            log_test("GET /api/categories?type=expense", True, f"Retornó {len(expense_categories)} categorías de gastos")
        else:
            log_test("GET /api/categories?type=expense", False, "Algunas categorías no son de tipo 'expense'")
    else:
        log_test("GET /api/categories?type=expense", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/categories?type=expense", False, f"Exception: {str(e)}")

# Test 1.4: GET /api/categories?type=income - filtrar solo ingresos
print("\n[1.4] GET /api/categories?type=income - Filtrar categorías de ingresos")
try:
    response = requests.get(f"{BASE_URL}/categories?type=income", timeout=10)
    if response.status_code == 200:
        income_categories = response.json()
        if all(cat['type'] == 'income' for cat in income_categories):
            log_test("GET /api/categories?type=income", True, f"Retornó {len(income_categories)} categorías de ingresos")
        else:
            log_test("GET /api/categories?type=income", False, "Algunas categorías no son de tipo 'income'")
    else:
        log_test("GET /api/categories?type=income", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/categories?type=income", False, f"Exception: {str(e)}")

# ==================== 2. TRANSACCIONES ====================
print("\n" + "=" * 80)
print("2. TESTING TRANSACCIONES")
print("=" * 80)

# Test 2.1: POST /api/transactions - crear un gasto
print("\n[2.1] POST /api/transactions - Crear gasto (Supermercado)")
try:
    expense_transaction = {
        "type": "expense",
        "amount": 5000,
        "category": "Comida",
        "description": "Supermercado",
        "date": datetime.now().isoformat()
    }
    response = requests.post(f"{BASE_URL}/transactions", json=expense_transaction, timeout=10)
    if response.status_code in [200, 201]:
        transaction_data = response.json()
        created_ids["transactions"].append({"id": transaction_data.get("_id"), "type": "expense"})
        log_test("POST /api/transactions (expense)", True, f"Gasto creado con ID: {transaction_data.get('_id')}")
    else:
        log_test("POST /api/transactions (expense)", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("POST /api/transactions (expense)", False, f"Exception: {str(e)}")

# Test 2.2: POST /api/transactions - crear un ingreso
print("\n[2.2] POST /api/transactions - Crear ingreso (Sueldo mensual)")
try:
    income_transaction = {
        "type": "income",
        "amount": 50000,
        "category": "Salario",
        "description": "Sueldo mensual",
        "date": datetime.now().isoformat()
    }
    response = requests.post(f"{BASE_URL}/transactions", json=income_transaction, timeout=10)
    if response.status_code in [200, 201]:
        transaction_data = response.json()
        created_ids["transactions"].append({"id": transaction_data.get("_id"), "type": "income"})
        log_test("POST /api/transactions (income)", True, f"Ingreso creado con ID: {transaction_data.get('_id')}")
    else:
        log_test("POST /api/transactions (income)", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("POST /api/transactions (income)", False, f"Exception: {str(e)}")

# Test 2.3: POST /api/transactions - crear un ahorro
print("\n[2.3] POST /api/transactions - Crear ahorro (Ahorro mensual)")
try:
    saving_transaction = {
        "type": "saving",
        "amount": 10000,
        "category": "Salario",
        "description": "Ahorro mensual",
        "date": datetime.now().isoformat()
    }
    response = requests.post(f"{BASE_URL}/transactions", json=saving_transaction, timeout=10)
    if response.status_code in [200, 201]:
        transaction_data = response.json()
        created_ids["transactions"].append({"id": transaction_data.get("_id"), "type": "saving"})
        log_test("POST /api/transactions (saving)", True, f"Ahorro creado con ID: {transaction_data.get('_id')}")
    else:
        log_test("POST /api/transactions (saving)", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("POST /api/transactions (saving)", False, f"Exception: {str(e)}")

# Test 2.4: GET /api/transactions - listar todas
print("\n[2.4] GET /api/transactions - Listar todas las transacciones")
try:
    response = requests.get(f"{BASE_URL}/transactions", timeout=10)
    if response.status_code == 200:
        transactions = response.json()
        log_test("GET /api/transactions", True, f"Retornó {len(transactions)} transacciones")
    else:
        log_test("GET /api/transactions", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/transactions", False, f"Exception: {str(e)}")

# Test 2.5: GET /api/transactions?type=expense - filtrar gastos
print("\n[2.5] GET /api/transactions?type=expense - Filtrar solo gastos")
try:
    response = requests.get(f"{BASE_URL}/transactions?type=expense", timeout=10)
    if response.status_code == 200:
        expense_transactions = response.json()
        if all(t['type'] == 'expense' for t in expense_transactions):
            log_test("GET /api/transactions?type=expense", True, f"Retornó {len(expense_transactions)} gastos")
        else:
            log_test("GET /api/transactions?type=expense", False, "Algunas transacciones no son de tipo 'expense'")
    else:
        log_test("GET /api/transactions?type=expense", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/transactions?type=expense", False, f"Exception: {str(e)}")

# Test 2.6: PUT /api/transactions/{id} - actualizar transacción
print("\n[2.6] PUT /api/transactions/{id} - Actualizar transacción")
if created_ids["transactions"]:
    try:
        transaction_id = created_ids["transactions"][0]["id"]
        updated_transaction = {
            "type": "expense",
            "amount": 6000,
            "category": "Comida",
            "description": "Supermercado - Actualizado",
            "date": datetime.now().isoformat()
        }
        response = requests.put(f"{BASE_URL}/transactions/{transaction_id}", json=updated_transaction, timeout=10)
        if response.status_code == 200:
            log_test("PUT /api/transactions/{id}", True, f"Transacción {transaction_id} actualizada correctamente")
        else:
            log_test("PUT /api/transactions/{id}", False, f"Status code: {response.status_code}", response.text)
    except Exception as e:
        log_test("PUT /api/transactions/{id}", False, f"Exception: {str(e)}")
else:
    log_warning("PUT /api/transactions/{id}", "No hay transacciones creadas para actualizar")

# Test 2.7: DELETE /api/transactions/{id} - eliminar transacción
print("\n[2.7] DELETE /api/transactions/{id} - Eliminar transacción")
if len(created_ids["transactions"]) > 1:
    try:
        transaction_id = created_ids["transactions"][-1]["id"]
        response = requests.delete(f"{BASE_URL}/transactions/{transaction_id}", timeout=10)
        if response.status_code == 200:
            log_test("DELETE /api/transactions/{id}", True, f"Transacción {transaction_id} eliminada correctamente")
            created_ids["transactions"].pop()
        else:
            log_test("DELETE /api/transactions/{id}", False, f"Status code: {response.status_code}", response.text)
    except Exception as e:
        log_test("DELETE /api/transactions/{id}", False, f"Exception: {str(e)}")
else:
    log_warning("DELETE /api/transactions/{id}", "No hay suficientes transacciones para eliminar")

# ==================== 3. PRESUPUESTOS ====================
print("\n" + "=" * 80)
print("3. TESTING PRESUPUESTOS")
print("=" * 80)

# Test 3.1: POST /api/budgets - crear presupuesto
print("\n[3.1] POST /api/budgets - Crear presupuesto para 'Comida'")
try:
    new_budget = {
        "category": "Comida",
        "monthly_limit": 30000,
        "alert_threshold": 80.0,
        "month": "2026-07"
    }
    response = requests.post(f"{BASE_URL}/budgets", json=new_budget, timeout=10)
    if response.status_code in [200, 201]:
        budget_data = response.json()
        created_ids["budget"] = budget_data.get("_id")
        current_spent = budget_data.get("current_spent", 0)
        log_test("POST /api/budgets", True, f"Presupuesto creado con ID: {created_ids['budget']}, current_spent: {current_spent}")
    else:
        log_test("POST /api/budgets", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("POST /api/budgets", False, f"Exception: {str(e)}")

# Test 3.2: GET /api/budgets - listar presupuestos del mes actual
print("\n[3.2] GET /api/budgets - Listar presupuestos del mes actual")
try:
    response = requests.get(f"{BASE_URL}/budgets", timeout=10)
    if response.status_code == 200:
        budgets = response.json()
        log_test("GET /api/budgets", True, f"Retornó {len(budgets)} presupuestos")
        
        # Verify current_spent is updated
        for budget in budgets:
            if 'current_spent' in budget:
                log_test("Budget current_spent field", True, f"Presupuesto '{budget['category']}' tiene current_spent: {budget['current_spent']}")
            else:
                log_test("Budget current_spent field", False, f"Presupuesto '{budget['category']}' no tiene campo current_spent")
    else:
        log_test("GET /api/budgets", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/budgets", False, f"Exception: {str(e)}")

# Test 3.3: GET /api/budgets/alerts - verificar alertas
print("\n[3.3] GET /api/budgets/alerts - Verificar alertas de presupuestos")
try:
    response = requests.get(f"{BASE_URL}/budgets/alerts", timeout=10)
    if response.status_code == 200:
        alerts = response.json()
        log_test("GET /api/budgets/alerts", True, f"Retornó {len(alerts)} alertas")
        for alert in alerts:
            print(f"   Alerta: {alert['category']} - {alert['percentage']:.1f}% del límite")
    else:
        log_test("GET /api/budgets/alerts", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/budgets/alerts", False, f"Exception: {str(e)}")

# Test 3.4: DELETE /api/budgets/{id} - eliminar presupuesto
print("\n[3.4] DELETE /api/budgets/{id} - Eliminar presupuesto")
if created_ids["budget"]:
    try:
        response = requests.delete(f"{BASE_URL}/budgets/{created_ids['budget']}", timeout=10)
        if response.status_code == 200:
            log_test("DELETE /api/budgets/{id}", True, f"Presupuesto {created_ids['budget']} eliminado correctamente")
        else:
            log_test("DELETE /api/budgets/{id}", False, f"Status code: {response.status_code}", response.text)
    except Exception as e:
        log_test("DELETE /api/budgets/{id}", False, f"Exception: {str(e)}")
else:
    log_warning("DELETE /api/budgets/{id}", "No hay presupuesto creado para eliminar")

# ==================== 4. INVERSIONES ====================
print("\n" + "=" * 80)
print("4. TESTING INVERSIONES")
print("=" * 80)

# Test 4.1: POST /api/investments - crear inversión crypto
print("\n[4.1] POST /api/investments - Crear inversión crypto (Bitcoin)")
try:
    crypto_investment = {
        "name": "Bitcoin",
        "type": "crypto",
        "quantity": 0.5,
        "purchase_price": 100000,
        "current_price": 120000,
        "date": datetime.now().isoformat()
    }
    response = requests.post(f"{BASE_URL}/investments", json=crypto_investment, timeout=10)
    if response.status_code in [200, 201]:
        investment_data = response.json()
        created_ids["investments"].append({"id": investment_data.get("_id"), "type": "crypto"})
        log_test("POST /api/investments (crypto)", True, f"Inversión crypto creada con ID: {investment_data.get('_id')}")
    else:
        log_test("POST /api/investments (crypto)", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("POST /api/investments (crypto)", False, f"Exception: {str(e)}")

# Test 4.2: POST /api/investments - crear inversión stock
print("\n[4.2] POST /api/investments - Crear inversión stock (YPF)")
try:
    stock_investment = {
        "name": "YPF",
        "type": "stock",
        "quantity": 10,
        "purchase_price": 5000,
        "current_price": 5500,
        "date": datetime.now().isoformat()
    }
    response = requests.post(f"{BASE_URL}/investments", json=stock_investment, timeout=10)
    if response.status_code in [200, 201]:
        investment_data = response.json()
        created_ids["investments"].append({"id": investment_data.get("_id"), "type": "stock"})
        log_test("POST /api/investments (stock)", True, f"Inversión stock creada con ID: {investment_data.get('_id')}")
    else:
        log_test("POST /api/investments (stock)", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("POST /api/investments (stock)", False, f"Exception: {str(e)}")

# Test 4.3: GET /api/investments - listar todas
print("\n[4.3] GET /api/investments - Listar todas las inversiones")
try:
    response = requests.get(f"{BASE_URL}/investments", timeout=10)
    if response.status_code == 200:
        investments = response.json()
        log_test("GET /api/investments", True, f"Retornó {len(investments)} inversiones")
    else:
        log_test("GET /api/investments", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/investments", False, f"Exception: {str(e)}")

# Test 4.4: GET /api/investments/total - obtener resumen de portfolio
print("\n[4.4] GET /api/investments/total - Obtener resumen de portfolio")
try:
    response = requests.get(f"{BASE_URL}/investments/total", timeout=10)
    if response.status_code == 200:
        portfolio = response.json()
        
        # Verify calculations
        expected_invested = (0.5 * 100000) + (10 * 5000)  # 50000 + 50000 = 100000
        expected_current = (0.5 * 120000) + (10 * 5500)  # 60000 + 55000 = 115000
        expected_profit = expected_current - expected_invested  # 15000
        expected_percentage = (expected_profit / expected_invested * 100)  # 15%
        
        actual_invested = portfolio.get('total_invested', 0)
        actual_current = portfolio.get('total_current_value', 0)
        actual_profit = portfolio.get('profit_loss', 0)
        actual_percentage = portfolio.get('profit_loss_percentage', 0)
        
        if abs(actual_invested - expected_invested) < 0.01:
            log_test("Investment total_invested calculation", True, f"Total invertido: {actual_invested}")
        else:
            log_test("Investment total_invested calculation", False, f"Esperado: {expected_invested}, Obtenido: {actual_invested}")
        
        if abs(actual_current - expected_current) < 0.01:
            log_test("Investment current_value calculation", True, f"Valor actual: {actual_current}")
        else:
            log_test("Investment current_value calculation", False, f"Esperado: {expected_current}, Obtenido: {actual_current}")
        
        if abs(actual_profit - expected_profit) < 0.01:
            log_test("Investment profit_loss calculation", True, f"Ganancia/Pérdida: {actual_profit}")
        else:
            log_test("Investment profit_loss calculation", False, f"Esperado: {expected_profit}, Obtenido: {actual_profit}")
        
        if abs(actual_percentage - expected_percentage) < 0.01:
            log_test("Investment profit_loss_percentage calculation", True, f"Porcentaje: {actual_percentage:.2f}%")
        else:
            log_test("Investment profit_loss_percentage calculation", False, f"Esperado: {expected_percentage:.2f}%, Obtenido: {actual_percentage:.2f}%")
    else:
        log_test("GET /api/investments/total", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/investments/total", False, f"Exception: {str(e)}")

# Test 4.5: PUT /api/investments/{id} - actualizar precio actual
print("\n[4.5] PUT /api/investments/{id} - Actualizar precio actual de inversión")
if created_ids["investments"]:
    try:
        investment_id = created_ids["investments"][0]["id"]
        updated_investment = {
            "name": "Bitcoin",
            "type": "crypto",
            "quantity": 0.5,
            "purchase_price": 100000,
            "current_price": 130000,
            "date": datetime.now().isoformat()
        }
        response = requests.put(f"{BASE_URL}/investments/{investment_id}", json=updated_investment, timeout=10)
        if response.status_code == 200:
            log_test("PUT /api/investments/{id}", True, f"Inversión {investment_id} actualizada correctamente")
        else:
            log_test("PUT /api/investments/{id}", False, f"Status code: {response.status_code}", response.text)
    except Exception as e:
        log_test("PUT /api/investments/{id}", False, f"Exception: {str(e)}")
else:
    log_warning("PUT /api/investments/{id}", "No hay inversiones creadas para actualizar")

# Test 4.6: DELETE /api/investments/{id} - eliminar inversión
print("\n[4.6] DELETE /api/investments/{id} - Eliminar inversión")
if len(created_ids["investments"]) > 1:
    try:
        investment_id = created_ids["investments"][-1]["id"]
        response = requests.delete(f"{BASE_URL}/investments/{investment_id}", timeout=10)
        if response.status_code == 200:
            log_test("DELETE /api/investments/{id}", True, f"Inversión {investment_id} eliminada correctamente")
            created_ids["investments"].pop()
        else:
            log_test("DELETE /api/investments/{id}", False, f"Status code: {response.status_code}", response.text)
    except Exception as e:
        log_test("DELETE /api/investments/{id}", False, f"Exception: {str(e)}")
else:
    log_warning("DELETE /api/investments/{id}", "No hay suficientes inversiones para eliminar")

# ==================== 5. ANALYTICS ====================
print("\n" + "=" * 80)
print("5. TESTING ANALYTICS")
print("=" * 80)

# Test 5.1: GET /api/analytics/dashboard?period=month
print("\n[5.1] GET /api/analytics/dashboard?period=month - Obtener resumen del mes")
try:
    response = requests.get(f"{BASE_URL}/analytics/dashboard?period=month", timeout=10)
    if response.status_code == 200:
        dashboard = response.json()
        
        required_fields = ['total_income', 'total_expenses', 'total_savings', 'total_investments', 'balance', 'period']
        if all(field in dashboard for field in required_fields):
            log_test("GET /api/analytics/dashboard", True, "Dashboard retornó todos los campos requeridos")
            print(f"   Total Income: {dashboard['total_income']}")
            print(f"   Total Expenses: {dashboard['total_expenses']}")
            print(f"   Total Savings: {dashboard['total_savings']}")
            print(f"   Total Investments: {dashboard['total_investments']}")
            print(f"   Balance: {dashboard['balance']}")
            print(f"   Period: {dashboard['period']}")
            
            # Verify balance calculation
            expected_balance = dashboard['total_income'] - dashboard['total_expenses']
            if abs(dashboard['balance'] - expected_balance) < 0.01:
                log_test("Dashboard balance calculation", True, f"Balance calculado correctamente: {dashboard['balance']}")
            else:
                log_test("Dashboard balance calculation", False, f"Esperado: {expected_balance}, Obtenido: {dashboard['balance']}")
        else:
            missing_fields = [f for f in required_fields if f not in dashboard]
            log_test("GET /api/analytics/dashboard", False, f"Campos faltantes: {missing_fields}")
    else:
        log_test("GET /api/analytics/dashboard", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/analytics/dashboard", False, f"Exception: {str(e)}")

# Test 5.2: GET /api/analytics/expenses-by-category?period=month
print("\n[5.2] GET /api/analytics/expenses-by-category?period=month - Gastos por categoría")
try:
    response = requests.get(f"{BASE_URL}/analytics/expenses-by-category?period=month", timeout=10)
    if response.status_code == 200:
        expenses_by_category = response.json()
        log_test("GET /api/analytics/expenses-by-category", True, f"Retornó {len(expenses_by_category)} categorías con gastos")
        
        # Verify percentages sum to ~100%
        if expenses_by_category:
            total_percentage = sum(cat['percentage'] for cat in expenses_by_category)
            if abs(total_percentage - 100) < 0.1:
                log_test("Expenses by category percentages", True, f"Porcentajes suman {total_percentage:.2f}%")
            else:
                log_test("Expenses by category percentages", False, f"Porcentajes suman {total_percentage:.2f}%, se esperaba ~100%")
            
            for cat in expenses_by_category[:3]:  # Show top 3
                print(f"   {cat['category']}: ${cat['total']} ({cat['percentage']:.1f}%)")
    else:
        log_test("GET /api/analytics/expenses-by-category", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/analytics/expenses-by-category", False, f"Exception: {str(e)}")

# Test 5.3: GET /api/analytics/trends?period=month&months=6
print("\n[5.3] GET /api/analytics/trends?period=month&months=6 - Tendencias de 6 meses")
try:
    response = requests.get(f"{BASE_URL}/analytics/trends?period=month&months=6", timeout=10)
    if response.status_code == 200:
        trends = response.json()
        if len(trends) == 6:
            log_test("GET /api/analytics/trends", True, f"Retornó tendencias de {len(trends)} meses")
            
            # Verify structure
            required_fields = ['period', 'income', 'expenses', 'balance']
            if all(all(field in trend for field in required_fields) for trend in trends):
                log_test("Trends structure", True, "Todos los meses tienen los campos requeridos")
                
                # Verify balance calculation for each month
                all_balances_correct = True
                for trend in trends:
                    expected_balance = trend['income'] - trend['expenses']
                    if abs(trend['balance'] - expected_balance) > 0.01:
                        all_balances_correct = False
                        break
                
                if all_balances_correct:
                    log_test("Trends balance calculation", True, "Balance calculado correctamente para todos los meses")
                else:
                    log_test("Trends balance calculation", False, "Algunos balances no están calculados correctamente")
                
                # Show first 3 months
                for trend in trends[:3]:
                    print(f"   {trend['period']}: Income ${trend['income']}, Expenses ${trend['expenses']}, Balance ${trend['balance']}")
            else:
                log_test("Trends structure", False, "Algunos meses no tienen todos los campos requeridos")
        else:
            log_test("GET /api/analytics/trends", False, f"Se esperaban 6 meses, se obtuvieron {len(trends)}")
    else:
        log_test("GET /api/analytics/trends", False, f"Status code: {response.status_code}", response.text)
except Exception as e:
    log_test("GET /api/analytics/trends", False, f"Exception: {str(e)}")

# ==================== SUMMARY ====================
print("\n" + "=" * 80)
print("TEST SUMMARY")
print("=" * 80)
print(f"✅ PASSED: {len(test_results['passed'])}")
print(f"❌ FAILED: {len(test_results['failed'])}")
print(f"⚠️  WARNINGS: {len(test_results['warnings'])}")

if test_results['failed']:
    print("\n" + "=" * 80)
    print("FAILED TESTS:")
    print("=" * 80)
    for result in test_results['failed']:
        print(f"\n❌ {result['test']}")
        print(f"   {result['message']}")

if test_results['warnings']:
    print("\n" + "=" * 80)
    print("WARNINGS:")
    print("=" * 80)
    for warning in test_results['warnings']:
        print(f"\n⚠️  {warning['test']}")
        print(f"   {warning['message']}")

print("\n" + "=" * 80)
print("TESTING COMPLETE")
print("=" * 80)

# Exit with appropriate code
exit(0 if len(test_results['failed']) == 0 else 1)
