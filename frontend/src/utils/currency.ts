/**
 * Formatea input de dinero mientras el usuario escribe.
 * - Puntos como separadores de miles (formato argentino)
 * - Coma o punto como separador decimal (acepta ambos por compatibilidad de teclados)
 *
 * Ejemplos:
 *   "10000" → "10.000"
 *   "1000000" → "1.000.000"
 *   "10000,50" → "10.000,50"
 *   "10000.50" → "10.000,50"
 */
export function formatMoneyInput(raw: string): string {
  if (!raw) return '';

  // Encontrar la última coma o punto (potencial separador decimal)
  let lastSepIdx = -1;
  for (let i = raw.length - 1; i >= 0; i--) {
    if (raw[i] === '.' || raw[i] === ',') {
      lastSepIdx = i;
      break;
    }
  }

  if (lastSepIdx === -1) {
    // Sin decimal: solo separadores de miles
    const digits = raw.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  const intPart = raw.substring(0, lastSepIdx).replace(/\D/g, '');
  const decPart = raw.substring(lastSepIdx + 1).replace(/\D/g, '').substring(0, 2);

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.') || '0';
  return `${formattedInt},${decPart}`;
}

/**
 * Convierte un string formateado (ej: "10.000,50") a número (10000.50)
 */
export function parseMoneyInput(formatted: string): number {
  if (!formatted) return 0;
  // Remover puntos (miles) y reemplazar coma por punto (decimal)
  const cleaned = formatted.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
