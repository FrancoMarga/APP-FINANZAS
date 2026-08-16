export const PREDEFINED_ICONS = [
  'wallet', 'restaurant', 'car', 'home', 'game-controller', 'medkit',
  'school', 'cart', 'construct', 'cash', 'laptop', 'trending-up',
  'gift', 'airplane', 'fitness', 'paw', 'shirt', 'phone-portrait',
  'book', 'musical-notes',
];

/**
 * true si el ícono guardado es un nombre de Ionicon (letras/números/guiones,
 * como "restaurant" o "ellipsis-horizontal"), false si es un emoji.
 * No depende de una lista fija: los nombres de Ionicons son siempre ASCII
 * en minúscula, mientras que un emoji real siempre tiene caracteres unicode
 * fuera de ese rango — así no hay riesgo de que se desactualice si el
 * backend agrega categorías con íconos nuevos que no estén en PREDEFINED_ICONS.
 */
export function isPredefinedIcon(icon: string): boolean {
  return /^[a-z0-9-]+$/.test(icon);
}
