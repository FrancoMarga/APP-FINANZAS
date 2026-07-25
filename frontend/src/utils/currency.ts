/**
 * Formatea input de dinero en pesos argentinos.
 * Solo enteros — puntos como separadores de miles.
 * NO acepta decimales (los centavos no se usan en la app).
 *
 * Ejemplos:
 *   "10000" → "10.000"
 *   "1000000" → "1.000.000"
 *   "12.000" → "12.000"
 */
export function formatMoneyInput(raw: string): string {
  if (!raw) return '';
  // Solo dígitos, todo lo demás se ignora
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  // Formato de miles con "."
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Convierte "10.000" a 10000 (entero)
 */
export function parseMoneyInput(formatted: string): number {
  if (!formatted) return 0;
  const cleaned = formatted.replace(/\./g, '');
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? 0 : n;
}
