const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';

let tokenGetter: () => string | null = () => null;

export const setTokenGetter = (fn: () => string | null) => {
  tokenGetter = fn;
};

const authHeaders = (): Record<string, string> => {
  const t = tokenGetter();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const jsonHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...authHeaders(),
});

async function handle(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Categories
  getCategories: (type?: string) =>
    fetch(`${API_URL}/categories${type ? `?type=${type}` : ''}`, { headers: authHeaders() }).then(handle),
  createCategory: (data: any) =>
    fetch(`${API_URL}/categories`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(data) }).then(handle),
  updateCategory: (id: string, data: any) =>
    fetch(`${API_URL}/categories/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(data) }).then(handle),
  deleteCategory: (id: string) =>
    fetch(`${API_URL}/categories/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handle),

  // Transactions
  getTransactions: (params?: { type?: string; month?: string; start_date?: string; end_date?: string }) => {
    const q = new URLSearchParams();
    if (params?.type) q.append('type', params.type);
    if (params?.month) q.append('month', params.month);
    if (params?.start_date) q.append('start_date', params.start_date);
    if (params?.end_date) q.append('end_date', params.end_date);
    const url = q.toString() ? `${API_URL}/transactions?${q}` : `${API_URL}/transactions`;
    return fetch(url, { headers: authHeaders() }).then(handle);
  },
  createTransaction: (data: any) =>
    fetch(`${API_URL}/transactions`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(data) }).then(handle),
  updateTransaction: (id: string, data: any) =>
    fetch(`${API_URL}/transactions/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(data) }).then(handle),
  deleteTransaction: (id: string) =>
    fetch(`${API_URL}/transactions/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handle),

  // Budgets
  getBudgets: (month?: string) =>
    fetch(`${API_URL}/budgets${month ? `?month=${month}` : ''}`, { headers: authHeaders() }).then(handle),
  createBudget: (data: any) =>
    fetch(`${API_URL}/budgets`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(data) }).then(handle),
  updateBudget: (id: string, data: any) =>
    fetch(`${API_URL}/budgets/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(data) }).then(handle),
  deleteBudget: (id: string) =>
    fetch(`${API_URL}/budgets/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handle),
  getBudgetAlerts: () =>
    fetch(`${API_URL}/budgets/alerts`, { headers: authHeaders() }).then(handle),

  // Investments
  getInvestments: () =>
    fetch(`${API_URL}/investments`, { headers: authHeaders() }).then(handle),
  createInvestment: (data: any) =>
    fetch(`${API_URL}/investments`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(data) }).then(handle),
  updateInvestment: (id: string, data: any) =>
    fetch(`${API_URL}/investments/${id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(data) }).then(handle),
  deleteInvestment: (id: string) =>
    fetch(`${API_URL}/investments/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handle),
  getInvestmentsTotal: () =>
    fetch(`${API_URL}/investments/total`, { headers: authHeaders() }).then(handle),

  // Crypto
  searchCrypto: (query: string) =>
    fetch(`${API_URL}/crypto/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() }).then(handle),
  getCryptoPrice: (coinId: string) =>
    fetch(`${API_URL}/crypto/price/${coinId}`, { headers: authHeaders() }).then(handle),
  syncCryptoPrices: () =>
    fetch(`${API_URL}/crypto/sync-prices`, { method: 'POST', headers: authHeaders() }).then(handle),

  // Analytics
  getDashboard: (period: string = 'month', month?: string) => {
    const q = new URLSearchParams();
    q.append('period', period);
    if (month) q.append('month', month);
    return fetch(`${API_URL}/analytics/dashboard?${q}`, { headers: authHeaders() }).then(handle);
  },
  getExpensesByCategory: (period: string = 'month', month?: string) => {
    const q = new URLSearchParams();
    q.append('period', period);
    if (month) q.append('month', month);
    return fetch(`${API_URL}/analytics/expenses-by-category?${q}`, { headers: authHeaders() }).then(handle);
  },
  getTrends: (months: number = 6) =>
    fetch(`${API_URL}/analytics/trends?months=${months}`, { headers: authHeaders() }).then(handle),
  getAvailableMonths: () =>
    fetch(`${API_URL}/analytics/available-months`, { headers: authHeaders() }).then(handle),

  // Backup
  exportBackup: () =>
    fetch(`${API_URL}/backup/export`, { headers: authHeaders() }).then(handle),
};
