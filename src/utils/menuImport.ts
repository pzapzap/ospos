// Menu import: counterpart to menuExport. Pick a JSON file via the iOS
// file picker, validate, batch-insert into local SQLite as additive data
// (does not wipe the existing menu). New UUIDs are generated for every
// row so re-importing the same file twice produces duplicates, not
// primary-key collisions.
//
// Hidden in Settings → Advanced for v1.1 alongside the Export button.
// Becomes a featured surface in v1.2 with menu templates.

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { createItem, createGroup, createModifier } from '../db/queries';
import { MENU_EXPORT_VERSION } from './menuExport';

interface ImportedModifierShape {
  name?: unknown;
  price_cents?: unknown;
  is_default?: unknown;
  is_available?: unknown;
  sticker_id?: unknown;
  sort_order?: unknown;
}

interface ImportedGroupShape {
  name?: unknown;
  select_type?: unknown;
  is_required?: unknown;
  max_select?: unknown;
  sort_order?: unknown;
  modifiers?: unknown;
}

interface ImportedItemShape {
  name?: unknown;
  price?: unknown;
  category?: unknown;
  sticker_id?: unknown;
  image_uri?: unknown;
  is_taxable?: unknown;
  is_available?: unknown;
  sort_order?: unknown;
  groups?: unknown;
  ungrouped_modifiers?: unknown;
}

interface ImportedFile {
  version?: unknown;
  items?: unknown;
}

export interface ImportPreview {
  itemCount: number;
  groupCount: number;
  modifierCount: number;
  // Raw parsed data the import will apply if confirmed. Caller passes
  // this object to applyMenuImport().
  parsed: ParsedMenu;
}

interface ParsedModifier {
  name: string;
  priceCents: number;
  isDefault: boolean;
  isAvailable: boolean;
  stickerId: string | null;
  sortOrder: number;
}

interface ParsedGroup {
  name: string;
  selectType: 'single' | 'multi';
  isRequired: boolean;
  maxSelect: number | null;
  sortOrder: number;
  modifiers: ParsedModifier[];
}

interface ParsedItem {
  name: string;
  price: number;
  category: string | null;
  stickerId: string | null;
  imageUri: string | null;
  isTaxable: boolean;
  isAvailable: boolean;
  sortOrder: number;
  groups: ParsedGroup[];
  ungroupedModifiers: ParsedModifier[];
}

export interface ParsedMenu {
  items: ParsedItem[];
}

function s(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function b(v: unknown): boolean {
  // SQLite int 0/1 OR boolean accepted.
  return v === 1 || v === true || v === '1';
}

function parseModifier(raw: ImportedModifierShape, fallbackSort: number): ParsedModifier | null {
  const name = s(raw.name).trim();
  if (!name) return null;
  return {
    name,
    priceCents: Math.round(n(raw.price_cents)),
    isDefault: b(raw.is_default),
    isAvailable: raw.is_available === undefined ? true : b(raw.is_available),
    stickerId: typeof raw.sticker_id === 'string' && raw.sticker_id ? raw.sticker_id : null,
    sortOrder: Number.isFinite(n(raw.sort_order)) ? n(raw.sort_order) : fallbackSort,
  };
}

function parseGroup(raw: ImportedGroupShape, fallbackSort: number): ParsedGroup | null {
  const name = s(raw.name).trim();
  if (!name) return null;
  const selectType: 'single' | 'multi' = raw.select_type === 'single' ? 'single' : 'multi';
  const modifiers = Array.isArray(raw.modifiers)
    ? raw.modifiers
        .map((m, i) => parseModifier(m as ImportedModifierShape, i))
        .filter((m): m is ParsedModifier => m !== null)
    : [];
  return {
    name,
    selectType,
    isRequired: b(raw.is_required),
    maxSelect: typeof raw.max_select === 'number' && raw.max_select > 0 ? Math.round(raw.max_select) : null,
    sortOrder: Number.isFinite(n(raw.sort_order)) ? n(raw.sort_order) : fallbackSort,
    modifiers,
  };
}

function parseItem(raw: ImportedItemShape, fallbackSort: number): ParsedItem | null {
  const name = s(raw.name).trim();
  if (!name) return null;
  const groups = Array.isArray(raw.groups)
    ? raw.groups
        .map((g, i) => parseGroup(g as ImportedGroupShape, i))
        .filter((g): g is ParsedGroup => g !== null)
    : [];
  const ungrouped = Array.isArray(raw.ungrouped_modifiers)
    ? raw.ungrouped_modifiers
        .map((m, i) => parseModifier(m as ImportedModifierShape, i))
        .filter((m): m is ParsedModifier => m !== null)
    : [];
  return {
    name,
    price: Math.max(0, Math.round(n(raw.price))),
    category: typeof raw.category === 'string' && raw.category ? raw.category : null,
    stickerId: typeof raw.sticker_id === 'string' && raw.sticker_id ? raw.sticker_id : null,
    imageUri: typeof raw.image_uri === 'string' && raw.image_uri ? raw.image_uri : null,
    isTaxable: raw.is_taxable === undefined ? true : b(raw.is_taxable),
    isAvailable: raw.is_available === undefined ? true : b(raw.is_available),
    sortOrder: Number.isFinite(n(raw.sort_order)) ? n(raw.sort_order) : fallbackSort,
    groups,
    ungroupedModifiers: ungrouped,
  };
}

function parseFile(json: string): ParsedMenu {
  let data: ImportedFile;
  try {
    data = JSON.parse(json) as ImportedFile;
  } catch {
    throw new Error('That file isn\'t valid JSON.');
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('Unexpected file shape.');
  }
  if (typeof data.version === 'number' && data.version > MENU_EXPORT_VERSION) {
    throw new Error(`This menu was exported by a newer version of OSPOS (v${data.version}). Update the app and try again.`);
  }
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems
    .map((it, i) => parseItem(it as ImportedItemShape, i))
    .filter((it): it is ParsedItem => it !== null);
  return { items };
}

export async function pickAndPreviewMenu(): Promise<ImportPreview | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'public.json', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];

  const json = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const parsed = parseFile(json);

  let groupCount = 0;
  let modifierCount = 0;
  for (const it of parsed.items) {
    groupCount += it.groups.length;
    for (const g of it.groups) modifierCount += g.modifiers.length;
    modifierCount += it.ungroupedModifiers.length;
  }
  return {
    itemCount: parsed.items.length,
    groupCount,
    modifierCount,
    parsed,
  };
}

export async function applyMenuImport(parsed: ParsedMenu): Promise<{ items: number; groups: number; modifiers: number }> {
  let createdItems = 0;
  let createdGroups = 0;
  let createdModifiers = 0;

  for (const it of parsed.items) {
    const newItem = await createItem(
      it.name,
      it.price,
      it.category ?? undefined,
      it.imageUri ?? undefined,
      it.stickerId ?? undefined,
      it.isTaxable,
      it.isAvailable,
    );
    createdItems += 1;

    // Groups + their modifiers.
    for (let gi = 0; gi < it.groups.length; gi++) {
      const g = it.groups[gi];
      const newGroup = await createGroup({
        itemId: newItem.id,
        name: g.name,
        selectType: g.selectType,
        isRequired: g.isRequired,
        maxSelect: g.maxSelect,
        sortOrder: g.sortOrder,
      });
      createdGroups += 1;

      for (let mi = 0; mi < g.modifiers.length; mi++) {
        const m = g.modifiers[mi];
        await createModifier({
          itemId: newItem.id,
          groupId: newGroup.id,
          name: m.name,
          priceCents: m.priceCents,
          groupName: g.name,
          stickerId: m.stickerId,
          isDefault: m.isDefault,
          isAvailable: m.isAvailable,
          sortOrder: m.sortOrder,
        });
        createdModifiers += 1;
      }
    }

    // Ungrouped modifiers — synthesize an "Options" group to hold them so
    // every modifier has a group post-v10. If there are no ungrouped mods,
    // skip.
    if (it.ungroupedModifiers.length > 0) {
      const fallback = await createGroup({
        itemId: newItem.id,
        name: 'Options',
        selectType: 'multi',
        isRequired: false,
        sortOrder: it.groups.length,
      });
      createdGroups += 1;
      for (let mi = 0; mi < it.ungroupedModifiers.length; mi++) {
        const m = it.ungroupedModifiers[mi];
        await createModifier({
          itemId: newItem.id,
          groupId: fallback.id,
          name: m.name,
          priceCents: m.priceCents,
          groupName: 'Options',
          stickerId: m.stickerId,
          isDefault: m.isDefault,
          isAvailable: m.isAvailable,
          sortOrder: m.sortOrder,
        });
        createdModifiers += 1;
      }
    }
  }

  return { items: createdItems, groups: createdGroups, modifiers: createdModifiers };
}
