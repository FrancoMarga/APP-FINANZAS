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

/**
 * Formatea input de dinero CON decimales (para Inversiones y Tarjetas,
 * donde sí importa la precisión exacta — precios de cripto, montos de
 * compras reales). Punto como separador de miles, coma como decimal
 * (formato argentino).
 *
 * Ejemplos:
 *   "76799" → "76.799"
 *   "76799,91" → "76.799,91"
 */
export function formatMoneyInputDecimal(raw: string): string {
  if (!raw) return '';
  // Cualquier caracter no numérico se toma como el separador decimal — el
  // teclado decimal-pad puede mostrar "." o "," según el celular, así que
  // aceptamos cualquiera de los dos. Tomamos el ÚLTIMO separador escrito
  // (no el primero), porque el propio formateo va insertando puntos de
  // miles a medida que el número crece (ej: "1.234"), y esos no deben
  // interpretarse como el separador decimal.
  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  const markerIndex = Math.max(lastDot, lastComma);
  let intPartRaw: string;
  let decPart: string | undefined;
  if (markerIndex === -1) {
    intPartRaw = raw.replace(/\D/g, '');
  } else {
    const afterMarker = raw.slice(markerIndex + 1).replace(/\D/g, '');
    // Un separador decimal real nunca tiene más de 2 dígitos guardados
    // (los centavos se recortan a 2). Si hay 3 o más dígitos después del
    // separador, es un punto de miles autogenerado al escribir, no una
    // coma/punto decimal tipeada por el usuario.
    if (afterMarker.length >= 3) {
      intPartRaw = raw.replace(/\D/g, '');
    } else {
      intPartRaw = raw.slice(0, markerIndex).replace(/\D/g, '');
      decPart = afterMarker.slice(0, 2);
    }
  }
  intPartRaw = intPartRaw.replace(/^0+(?=\d)/, '');
  const formattedInt = intPartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (decPart === undefined) return formattedInt;
  return `${formattedInt},${decPart}`;
}

/**
 * Convierte "76.799,91" a 76799.91 (con decimales)
 */
export function parseMoneyInputDecimal(formatted: string): number {
  if (!formatted) return 0;
  const cleaned = formatted.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
