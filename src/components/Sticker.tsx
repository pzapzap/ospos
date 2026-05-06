import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { getStickerXml } from '../assets/stickers';

interface StickerProps {
  id: string;          // e.g. 'food/burger'
  size?: number;
}

// Renders a Fluent Emoji Flat sticker by ID. Returns null if the ID isn't in
// the bundled set — caller should fall through to the glyph layer.
export default function Sticker({ id, size = 48 }: StickerProps) {
  const xml = getStickerXml(id);
  if (!xml) return null;
  return (
    <View style={{ width: size, height: size }}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}
