import { useCallback, useEffect, useState } from 'react';
import { storage } from '@/src/utils/storage';

const HIDE_AMOUNTS_KEY = 'hide_amounts';

/**
 * Hook compartido para el modo "ocultar saldo".
 * Persiste la preferencia entre sesiones, y se puede usar en cualquier
 * pantalla que muestre montos (dashboard, inversiones, etc).
 */
export function useHideAmounts() {
  const [hidden, setHidden] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem(HIDE_AMOUNTS_KEY);
      if (saved === true) setHidden(true);
      setLoaded(true);
    })();
  }, []);

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      storage.setItem(HIDE_AMOUNTS_KEY, next);
      return next;
    });
  }, []);

  return { hidden, toggle, loaded };
}

/** Enmascara un monto ya formateado (ej: "$12.345,00" -> "$••••••"). */
export function maskAmount(formatted: string): string {
  // Conserva el símbolo de moneda inicial si lo tiene ($ o €, etc.)
  const match = formatted.match(/^([^\d]*)/);
  const prefix = match ? match[1] : '';
  return `${prefix}••••••`;
}
