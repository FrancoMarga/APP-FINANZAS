import { create } from 'zustand';
import { ToastType } from '@/src/components/Toast';

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
  show: (message: string, type?: ToastType) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  visible: false,
  message: '',
  type: 'info',
  show: (message, type = 'info') => set({ visible: true, message, type }),
  hide: () => set({ visible: false }),
}));
