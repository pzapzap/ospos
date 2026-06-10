// Menu export: serializes items + modifier groups + modifiers to JSON and
// triggers the iOS share sheet so a merchant can back up their menu before
// rebuilding it for testing, migrating to a new device, or experimenting.
//
// Output is intentionally structured to be re-importable as a menu template
// in v1.2 (see Task #115). Hidden in Settings → Advanced for v1.1 — not
// surfaced in launch copy or onboarding.
//
// IDs are preserved so the same export → import on the same device is
// idempotent; a future import path will need to either dedupe by id or
// regenerate ids depending on the desired semantics.

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getActiveItems, getGroupsForItem, getModifiersForGroup, getModifiersForItem } from '../db/queries';

export const MENU_EXPORT_VERSION = 1;

interface ExportedModifier {
  id: string;
  name: string;
  price_cents: number;
  is_default: number;
  is_available: number;
  sticker_id: string | null;
  sort_order: number;
}

interface ExportedGroup {
  id: string;
  name: string;
  select_type: 'single' | 'multi';
  is_required: number;
  max_select: number | null;
  sort_order: number;
  modifiers: ExportedModifier[];
}

interface ExportedItem {
  id: string;
  name: string;
  price: number;
  category: string | null;
  sticker_id: string | null;
  image_uri: string | null;
  is_taxable: number;
  is_available: number;
  sort_order: number;
  groups: ExportedGroup[];
  // Modifiers without a group_id (legacy pre-v10 data) sit here as a flat
  // list. Most exports will have zero of these.
  ungrouped_modifiers: ExportedModifier[];
}

interface MenuExport {
  version: number;
  exported_at: string;
  source: 'ospos';
  app_version: string;
  items: ExportedItem[];
}

async function buildMenuExport(appVersion: string): Promise<MenuExport> {
  const items = await getActiveItems();
  const exportedItems: ExportedItem[] = [];

  for (const item of items) {
    const groups = await getGroupsForItem(item.id);
    const allMods = await getModifiersForItem(item.id);

    const exportedGroups: ExportedGroup[] = [];
    for (const g of groups) {
      const groupMods = await getModifiersForGroup(g.id);
      exportedGroups.push({
        id: g.id,
        name: g.name,
        select_type: g.select_type,
        is_required: g.is_required,
        max_select: g.max_select,
        sort_order: g.sort_order,
        modifiers: groupMods.map((m) => ({
          id: m.id,
          name: m.name,
          price_cents: m.price_cents,
          is_default: m.is_default,
          is_available: m.is_available,
          sticker_id: m.sticker_id,
          sort_order: m.sort_order,
        })),
      });
    }

    // Any modifier that doesn't belong to a group (legacy data). Filter out
    // ones already represented in a group above.
    const groupedIds = new Set(exportedGroups.flatMap((g) => g.modifiers.map((m) => m.id)));
    const ungrouped: ExportedModifier[] = allMods
      .filter((m) => !groupedIds.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        price_cents: m.price_cents,
        is_default: m.is_default,
        is_available: m.is_available,
        sticker_id: m.sticker_id,
        sort_order: m.sort_order,
      }));

    exportedItems.push({
      id: item.id,
      name: item.name,
      price: item.price,
      category: item.category,
      sticker_id: item.sticker_id,
      image_uri: item.image_uri,
      is_taxable: item.is_taxable,
      is_available: item.is_available,
      sort_order: item.sort_order,
      groups: exportedGroups,
      ungrouped_modifiers: ungrouped,
    });
  }

  return {
    version: MENU_EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    source: 'ospos',
    app_version: appVersion,
    items: exportedItems,
  };
}

export async function shareMenuJson(appVersion: string): Promise<{ shared: boolean; itemCount: number }> {
  const data = await buildMenuExport(appVersion);
  const itemCount = data.items.length;

  if (itemCount === 0) {
    return { shared: false, itemCount: 0 };
  }

  const json = JSON.stringify(data, null, 2);
  const stamp = data.exported_at.replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  const fileName = `ospos-menu-${stamp}.json`;
  const filePath = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(filePath, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    return { shared: false, itemCount };
  }

  await Sharing.shareAsync(filePath, {
    mimeType: 'application/json',
    UTI: 'public.json',
  });

  return { shared: true, itemCount };
}
