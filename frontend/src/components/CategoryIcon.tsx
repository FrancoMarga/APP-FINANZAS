import React from 'react';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isPredefinedIcon } from '@/src/utils/categoryIcon';

interface Props {
  icon: string;
  size?: number;
  color?: string;
}

/** Renderiza el ícono de una categoría: Ionicon predefinido, o emoji personalizado. */
export default function CategoryIcon({ icon, size = 18, color }: Props) {
  if (isPredefinedIcon(icon)) {
    return <Ionicons name={icon as any} size={size} color={color} />;
  }
  // Es un emoji (o cualquier otro texto que el usuario haya puesto)
  return <Text style={{ fontSize: size, lineHeight: size * 1.2 }}>{icon}</Text>;
}
