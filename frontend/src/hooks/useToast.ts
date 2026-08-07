import { create } from 'zustand';
import { ToastType } from '@/src/components/Toast';

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
  duration: number;
  show: (message: string, type?: ToastType, duration?: number) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  visible: false,
  message: '',
  type: 'info',
  duration: 3000,
  // Los warnings (ej: alerta de presupuesto) duran mas por defecto,
  // salvo que se pase una duracion explicita.
  show: (message, type = 'info', duration) =>
    set({ visible: true, message, type, duration: duration ?? (type === 'warning' ? 5000 : 3000) }),
  hide: () => set({ visible: false }),
}));
