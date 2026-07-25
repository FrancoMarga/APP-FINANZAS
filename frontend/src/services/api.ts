const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';

interface TransactionCreate {
  type: 'expense' | 'income' | 'saving';
  amount: number;
  category: string;
  description?: string;
  date?: string;
}

interface InvestmentCreate {
  name: string;
  type: 'crypto' | 'stock' | 'other';
  quantity: number;
  purchase_price: number;
  current_price: number;
  date?: string;
}

interface BudgetCreate {
  category: string;
  monthly_limit: number;
  alert_threshold?: number;
  month: string;
}

interface CategoryCreate {
  name: string;
  type: 'expense' | 'income' | 'investment';
  icon?: string;
  color?: string;
}

export const api = {
  // Categories
  getCategories: async (type?: string) => {
    const url = type ? `${API_URL}/categories?type=${type}` : `${API_URL}/categories`;
    const response = await fetch(url);
    return response.json();
  },
  createCategory: async (category: CategoryCreate) => {
    const response = await fetch(`${API_URL}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(category),
    });
    return response.json();
  },
  deleteCategory: async (id: string) => {
    const response = await fetch(`${API_URL}/categories/${id}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // Transactions
  getTransactions: async (filters?: { type?: string; start_date?: string; end_date?: string; category?: string }) => {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    if (filters?.category) params.append('category', filters.category);
    
    const url = params.toString() ? `${API_URL}/transactions?${params}` : `${API_URL}/transactions`;
    const response = await fetch(url);
    return response.json();
  },
  createTransaction: async (transaction: TransactionCreate) => {
    const response = await fetch(`${API_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction),
    });
    return response.json();
  },
  updateTransaction: async (id: string, transaction: TransactionCreate) => {
    const response = await fetch(`${API_URL}/transactions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction),
    });
    return response.json();
  },
  deleteTransaction: async (id: string) => {
    const response = await fetch(`${API_URL}/transactions/${id}`, {
      method: 'DELETE',
    });
    return response.json();
  },

  // Budgets
  getBudgets: async (month?: string) => {
    const url = month ? `${API_URL}/budgets?month=${month}` : `${API_URL}/budgets`;
    const response = await fetch(url);
    return response.json();
  },
  createBudget: async (budget: BudgetCreate) => {
    const response = await fetch(`${API_URL}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(budget),
    });
    return response.json();
  },
  updateBudget: async (id: string, budget: BudgetCreate) => {
    const response = await fetch(`${API_URL}/budgets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(budget),
    });
    return response.json();
  },
  deleteBudget: async (id: string) => {
    const response = await fetch(`${API_URL}/budgets/${id}`, {
      method: 'DELETE',
    });
    return response.json();
  },
  getBudgetAlerts: async () => {
    const response = await fetch(`${API_URL}/budgets/alerts`);
    return response.json();
  },

  // Investments
  getInvestments: async () => {
    const response = await fetch(`${API_URL}/investments`);
    return response.json();
  },
  createInvestment: async (investment: InvestmentCreate) => {
    const response = await fetch(`${API_URL}/investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(investment),
    });
    return response.json();
  },
  updateInvestment: async (id: string, investment: InvestmentCreate) => {
    const response = await fetch(`${API_URL}/investments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(investment),
    });
    return response.json();
  },
  deleteInvestment: async (id: string) => {
    const response = await fetch(`${API_URL}/investments/${id}`, {
      method: 'DELETE',
    });
    return response.json();
  },
  getInvestmentsTotal: async () => {
    const response = await fetch(`${API_URL}/investments/total`);
    return response.json();
  },

  // Analytics
  getDashboard: async (period: 'day' | 'week' | 'month' = 'month') => {
    const response = await fetch(`${API_URL}/analytics/dashboard?period=${period}`);
    return response.json();
  },
  getExpensesByCategory: async (period: 'day' | 'week' | 'month' = 'month') => {
    const response = await fetch(`${API_URL}/analytics/expenses-by-category?period=${period}`);
    return response.json();
  },
  getTrends: async (period: 'month' = 'month', months: number = 6) => {
    const response = await fetch(`${API_URL}/analytics/trends?period=${period}&months=${months}`);
    return response.json();
  },
};