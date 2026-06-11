// Menu import: counterpart to menuExport. Pick a JSON file via the iOS
// file picker, validate, batch-insert into local SQLite as additive data
// (does not wipe the existing menu). New UUIDs are generated for every
// row so re-importing the same file twice produces duplicates, not
// primary-key collisions.
//
// Hidden in Settings → Advanced for v1.1 alongside the Export button.
// Becomes a featured surface in v1.2 with menu templates.
//
// ─── SECURITY MODEL ────────────────────────────────────────────────────
// The import accepts arbitrary JSON from any source the user picks
// (Files, AirDrop, email). It MUST treat every input as hostile. Hardened
// against:
//
//   • SQL injection — every write uses parameterized queries via the
//     createItem/createGroup/createModifier helpers in queries.ts. JSON
//     values are NEVER interpolated into SQL.
//   • XSS — strings are stored verbatim and only rendered through React
//     Native Text (auto-escapes) or the server template (which already
//     escapeHtml()s every interpolated field). No `dangerouslySetInnerHTML`
//     or `innerHTML` anywhere in the rendering path.
//   • DoS via oversized files — MAX_FILE_SIZE_BYTES (5 MB) hard cap
//     enforced BEFORE parse so a 1 GB JSON can't blow up V8.
//   • DoS via huge counts — caps on items per file (MAX_ITEMS_PER_IMPORT),
//     groups per item, modifiers per group.
//   • DoS via long strings — names truncated to MAX_NAME_LEN, category
//     to MAX_CATEGORY_LEN.
//   • Integer overflow — prices clamped to [0, MAX_PRICE_CENTS] and
//     modifier deltas to [-MAX_PRICE_CENTS, MAX_PRICE_CENTS]. sort_order
//     clamped non-negative.
//   • Sticker ID injection — STICKER_ID_REGEX allowlist accepts only the
//     four known prefixes and lowercase a-z/0-9/_ characters. Any other
//     string is dropped to null (item renders the letter monogram instead).
//   • image_uri injection — REJECTED outright on import. A crafted
//     `data:` or `javascript:` URI in image_uri would never execute (RN
//     Image fails gracefully on non-image MIME) but we strip it anyway
//     to keep the import surface tight. Users add photos via the editor
//     UI, which only accepts the OS image picker.
//   • Prototype pollution — JSON.parse produces plain objects with no
//     __proto__ side effects; our parsers explicitly pluck named fields
//     (no Object.assign or spread from untrusted source).
//   • Partial-import corruption — applyMenuImport wraps every write in
//     a single SQLite transaction. If anything throws midway, ROLLBACK
//     restores the menu to its pre-import state. No "half-imported"
//     window.
//   • Schema version skew — files declaring a future version
//     (data.version > MENU_EXPORT_VERSION) are rejected with a clear
//     error before any DB write happens.

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '../db/database';
import { createItem, createGroup, createModifier } from '../db/queries';
import { MENU_EXPORT_VERSION } from './menuExport';
import { MAX_ITEM_NAME_LENGTH, MAX_CATEGORY_LENGTH } from './validation';

// ─── Hardening caps ─────────────────────────────────────────────────────
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;     // 5 MB
const MAX_ITEMS_PER_IMPORT = 500;
const MAX_GROUPS_PER_ITEM = 50;
const MAX_MODIFIERS_PER_GROUP = 200;
const MAX_NAME_LEN = MAX_ITEM_NAME_LENGTH;       // 256, mirrors editor
const MAX_CATEGORY_LEN = MAX_CATEGORY_LENGTH;    // 50, mirrors editor
const MAX_PRICE_CENTS = 99_999_99;               // $99,999.99 — mirrors validatePrice
const MIN_MODIFIER_CENTS = -MAX_PRICE_CENTS;     // negative allowed ("no protein -$1.50")
const MAX_SORT_ORDER = 100_000;

// Sticker IDs in the bundled library follow this exact shape. Anything
// outside the allowlist is dropped to null (renders as a monogram).
const STICKER_ID_REGEX = /^(food|drinks|retail|service)\/[a-z0-9_]+$/;

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
  // Counts of things we silently dropped during validation — surfaced in
  // the confirmation UI so the merchant knows the file wasn't fully
  // preserved if anything looked off.
  rejectedItems: number;
  rejectedModifiers: number;
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
  isTaxable: boolean;
  isAvailable: boolean;
  sortOrder: number;
  groups: ParsedGroup[];
  ungroupedModifiers: ParsedModifier[];
}

export interface ParsedMenu {
  items: ParsedItem[];
}

// ─── Coercion primitives ────────────────────────────────────────────────
function s(v: unknown, maxLen: number): string {
  if (typeof v !== 'string') return '';
  // strip control chars (incl. \0) but keep tabs/newlines, then truncate.
  // Defensive against malformed unicode or terminator injection in stored
  // strings that a future renderer might mishandle.
  const cleaned = v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  return cleaned.slice(0, maxLen);
}

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function b(v: unknown): boolean {
  return v === 1 || v === true || v === '1';
}

function clampInt(v: number, min: number, max: number): number {
  const rounded = Math.round(v);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function validateStickerId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (v.length > 60) return null; // structural cap
  return STICKER_ID_REGEX.test(v) ? v : null;
}

// ─── Parsers ────────────────────────────────────────────────────────────
function parseModifier(raw: ImportedModifierShape, fallbackSort: number): ParsedModifier | null {
  const name = s(raw.name, MAX_NAME_LEN).trim();
  if (!name) return null;
  const rawCents = n(raw.price_cents);
  return {
    name,
    priceCents: clampInt(rawCents, MIN_MODIFIER_CENTS, MAX_PRICE_CENTS),
    isDefault: b(raw.is_default),
    isAvailable: raw.is_available === undefined ? true : b(raw.is_available),
    stickerId: validateStickerId(raw.sticker_id),
    sortOrder: clampInt(Number.isFinite(n(raw.sort_order)) ? n(raw.sort_order) : fallbackSort, 0, MAX_SORT_ORDER),
  };
}

function parseGroup(raw: ImportedGroupShape, fallbackSort: number): ParsedGroup | null {
  const name = s(raw.name, MAX_NAME_LEN).trim();
  if (!name) return null;
  const selectType: 'single' | 'multi' = raw.select_type === 'single' ? 'single' : 'multi';
  const rawMods = Array.isArray(raw.modifiers) ? raw.modifiers.slice(0, MAX_MODIFIERS_PER_GROUP) : [];
  const modifiers = rawMods
    .map((m, i) => parseModifier(m as ImportedModifierShape, i))
    .filter((m): m is ParsedModifier => m !== null);
  return {
    name,
    selectType,
    isRequired: b(raw.is_required),
    maxSelect: typeof raw.max_select === 'number' && raw.max_select > 0
      ? clampInt(raw.max_select, 1, MAX_MODIFIERS_PER_GROUP)
      : null,
    sortOrder: clampInt(Number.isFinite(n(raw.sort_order)) ? n(raw.sort_order) : fallbackSort, 0, MAX_SORT_ORDER),
    modifiers,
  };
}

function parseItem(raw: ImportedItemShape, fallbackSort: number): ParsedItem | null {
  const name = s(raw.name, MAX_NAME_LEN).trim();
  if (!name) return null;
  const rawGroups = Array.isArray(raw.groups) ? raw.groups.slice(0, MAX_GROUPS_PER_ITEM) : [];
  const groups = rawGroups
    .map((g, i) => parseGroup(g as ImportedGroupShape, i))
    .filter((g): g is ParsedGroup => g !== null);
  const rawUngrouped = Array.isArray(raw.ungrouped_modifiers)
    ? raw.ungrouped_modifiers.slice(0, MAX_MODIFIERS_PER_GROUP)
    : [];
  const ungrouped = rawUngrouped
    .map((m, i) => parseModifier(m as ImportedModifierShape, i))
    .filter((m): m is ParsedModifier => m !== null);
  return {
    name,
    price: clampInt(Math.max(0, n(raw.price)), 0, MAX_PRICE_CENTS),
    category: s(raw.category, MAX_CATEGORY_LEN).trim() || null,
    stickerId: validateStickerId(raw.sticker_id),
    // image_uri is REJECTED outright on import. See SECURITY MODEL above.
    isTaxable: raw.is_taxable === undefined ? true : b(raw.is_taxable),
    isAvailable: raw.is_available === undefined ? true : b(raw.is_available),
    sortOrder: clampInt(Number.isFinite(n(raw.sort_order)) ? n(raw.sort_order) : fallbackSort, 0, MAX_SORT_ORDER),
    groups,
    ungroupedModifiers: ungrouped,
  };
}

interface ParseResult {
  parsed: ParsedMenu;
  rejectedItems: number;
  rejectedModifiers: number;
}

function parseFile(json: string): ParseResult {
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
  if (rawItems.length > MAX_ITEMS_PER_IMPORT) {
    throw new Error(`This file declares ${rawItems.length} items — the per-import cap is ${MAX_ITEMS_PER_IMPORT}. Split the file and try again.`);
  }

  let rejectedItems = 0;
  let rejectedModifiers = 0;

  const items: ParsedItem[] = [];
  for (let i = 0; i < rawItems.length; i++) {
    const it = parseItem(rawItems[i] as ImportedItemShape, i);
    if (it === null) {
      rejectedItems += 1;
      continue;
    }
    // Count dropped modifiers (post-cap, post-validation).
    const rawIt = rawItems[i] as ImportedItemShape;
    let submittedMods = 0;
    if (Array.isArray(rawIt.groups)) {
      for (const g of rawIt.groups as unknown[]) {
        const grp = g as ImportedGroupShape;
        if (Array.isArray(grp.modifiers)) submittedMods += grp.modifiers.length;
      }
    }
    if (Array.isArray(rawIt.ungrouped_modifiers)) {
      submittedMods += rawIt.ungrouped_modifiers.length;
    }
    let keptMods = it.ungroupedModifiers.length;
    for (const g of it.groups) keptMods += g.modifiers.length;
    rejectedModifiers += Math.max(0, submittedMods - keptMods);

    items.push(it);
  }

  return { parsed: { items }, rejectedItems, rejectedModifiers };
}

export async function pickAndPreviewMenu(): Promise<ImportPreview | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'public.json', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];

  // Reject oversized files BEFORE loading them into memory.
  if (typeof asset.size === 'number' && asset.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`That file is ${(asset.size / 1024 / 1024).toFixed(1)} MB. The import cap is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`);
  }

  const json = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  // Second-line defense in case the platform didn't surface size correctly.
  if (json.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`That file is too large to import. The cap is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`);
  }

  const { parsed, rejectedItems, rejectedModifiers } = parseFile(json);

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
    rejectedItems,
    rejectedModifiers,
    parsed,
  };
}

export async function applyMenuImport(parsed: ParsedMenu): Promise<{ items: number; groups: number; modifiers: number }> {
  const db = getDatabase();
  let createdItems = 0;
  let createdGroups = 0;
  let createdModifiers = 0;

  // Single transaction: a failure anywhere rolls the whole import back so
  // the merchant never ends up with a half-imported menu. createItem and
  // friends use the same connection so all writes share this scope.
  await db.execAsync('BEGIN TRANSACTION');
  try {
    for (const it of parsed.items) {
      const newItem = await createItem(
        it.name,
        it.price,
        it.category ?? undefined,
        undefined,  // image_uri intentionally not imported — see SECURITY MODEL
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

      // Ungrouped legacy modifiers — synthesize an "Options" group to
      // hold them so every modifier has a group post-v10.
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
    await db.execAsync('COMMIT');
  } catch (err) {
    await db.execAsync('ROLLBACK');
    throw err;
  }

  return { items: createdItems, groups: createdGroups, modifiers: createdModifiers };
}
