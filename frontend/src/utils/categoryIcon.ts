export const PREDEFINED_ICONS = [
  'wallet', 'restaurant', 'car', 'home', 'game-controller', 'medkit',
  'school', 'cart', 'construct', 'cash', 'laptop', 'trending-up',
  'gift', 'airplane', 'fitness', 'paw', 'shirt', 'phone-portrait',
  'book', 'musical-notes',
];

/** true si el ícono guardado es uno de los predefinidos (Ionicons), no un emoji. */
export function isPredefinedIcon(icon: string): boolean {
  return PREDEFINED_ICONS.includes(icon);
}
