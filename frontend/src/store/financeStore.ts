import { create } from 'zustand';

interface Transaction {
  _id: string;
  type: 'expense' | 'income' | 'saving';
  amount: number;
  category: string;
  description: string;
  date: string;
}

interface Category {
  _id: string;
  name: string;
  type: 'expense' | 'income' | 'investment';
  icon: string;
  color: string;
  is_custom: boolean;
}

interface Budget {
  _id: string;
  category: string;
  monthly_limit: number;
  current_spent: number;
  alert_threshold: number;
  month: string;
}

interface Investment {
  _id: string;
  name: string;
  type: 'crypto' | 'stock' | 'other';
  quantity: number;
  purchase_price: number;
  current_price: number;
  date: string;
}

interface DashboardData {
  total_income: number;
  total_expenses: number;
  total_savings: number;
  total_investments: number;
  balance: number;
  period: string;
}

interface FinanceStore {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  investments: Investment[];
  dashboardData: DashboardData | null;
  selectedPeriod: 'day' | 'week' | 'month';
  setTransactions: (transactions: Transaction[]) => void;
  setCategories: (categories: Category[]) => void;
  setBudgets: (budgets: Budget[]) => void;
  setInvestments: (investments: Investment[]) => void;
  setDashboardData: (data: DashboardData) => void;
  setSelectedPeriod: (period: 'day' | 'week' | 'month') => void;
}

export const useFinanceStore = create<FinanceStore>((set) => ({
  transactions: [],
  categories: [],
  budgets: [],
  investments: [],
  dashboardData: null,
  selectedPeriod: 'month',
  setTransactions: (transactions) => set({ transactions }),
  setCategories: (categories) => set({ categories }),
  setBudgets: (budgets) => set({ budgets }),
  setInvestments: (investments) => set({ investments }),
  setDashboardData: (data) => set({ dashboardData: data }),
  setSelectedPeriod: (period) => set({ selectedPeriod: period }),
}));