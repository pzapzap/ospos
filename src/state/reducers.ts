// Order state and settings state reducers
// All money values (itemPrice, subtotal, taxAmount, tipAmount, total) are integer cents.
import { MAX_ITEM_QUANTITY } from '../utils/validation';
import type { ModifierSnapshot } from '../db/queries';

export interface OrderLineItem {
  itemId: string;
  itemName: string;
  itemPrice: number;              // base price BEFORE modifiers
  quantity: number;
  modifiers: ModifierSnapshot[];  // selected mods (empty for un-customized items)
  isTaxable: boolean;             // captured from item at tap time; defaults true
}

export interface OrderDiscount {
  type: 'percent' | 'amount';
  value: number;        // raw input — 10 for 10%, 150 for $1.50
  amount: number;       // computed cents, capped at subtotal
  reason?: string;
}

export interface OrderState {
  items: OrderLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  discount: OrderDiscount | null;
}

export type OrderAction =
  | { type: 'ADD_ITEM'; payload: { itemId: string; itemName: string; itemPrice: number; modifiers?: ModifierSnapshot[]; quantity?: number; isTaxable?: boolean } }
  | { type: 'UPDATE_LINE'; payload: { lineIndex: number; modifiers: ModifierSnapshot[]; quantity: number } }
  | { type: 'REMOVE_ITEM'; payload: { lineIndex: number } }
  | { type: 'INCREMENT_ITEM'; payload: { lineIndex: number } }
  | { type: 'DECREMENT_ITEM'; payload: { lineIndex: number } }
  | { type: 'SET_TIP'; payload: { amount: number } }
  | { type: 'SET_TAX_RATE'; payload: { rate: number } }
  | { type: 'SET_DISCOUNT'; payload: { type: 'percent' | 'amount'; value: number; reason?: string } }
  | { type: 'CLEAR_DISCOUNT' }
  | { type: 'CLEAR_ORDER' };

function lineSubtotal(line: OrderLineItem): number {
  const modAdjustment = line.modifiers.reduce((sum, m) => sum + m.price_cents, 0);
  return (line.itemPrice + modAdjustment) * line.quantity;
}

// Compute the discount amount in cents from the merchant's raw input.
// % discount: subtotal × value / 100, then rounded.
// $ discount: value (already cents), capped at subtotal so we never go below 0.
function computeDiscountAmount(
  discount: { type: 'percent' | 'amount'; value: number } | null,
  subtotal: number,
): number {
  if (!discount || discount.value <= 0 || subtotal <= 0) return 0;
  if (discount.type === 'percent') {
    const pct = Math.min(100, discount.value);
    return Math.round(subtotal * (pct / 100));
  }
  return Math.min(subtotal, Math.round(discount.value));
}

function recalculate(
  items: OrderLineItem[],
  taxRate: number,
  tipAmount: number,
  discountInput: { type: 'percent' | 'amount'; value: number; reason?: string } | null,
): OrderState {
  const subtotal = items.reduce((sum, item) => sum + lineSubtotal(item), 0);
  // Tax only applies to the lines flagged isTaxable. Non-taxable items
  // (packaged retail, gift cards, certain prepared goods depending on
  // jurisdiction) still count toward subtotal but not toward the tax base.
  const taxableSubtotal = items.reduce(
    (sum, item) => sum + (item.isTaxable ? lineSubtotal(item) : 0),
    0
  );

  const discountAmount = computeDiscountAmount(discountInput, subtotal);
  // Discount reduces the taxable subtotal proportionally so mixed
  // taxable/non-taxable carts stay honest. If subtotal is all taxable, the
  // discounted taxable base equals taxableSubtotal − discountAmount. If half
  // the cart is non-taxable, only half the discount reduces the tax base.
  const discountedTaxableSubtotal =
    subtotal > 0
      ? Math.max(0, taxableSubtotal - Math.round(discountAmount * (taxableSubtotal / subtotal)))
      : 0;
  const taxAmount = Math.round(discountedTaxableSubtotal * (taxRate / 100));
  const total = subtotal - discountAmount + taxAmount + tipAmount;

  const discount: OrderDiscount | null = discountInput && discountAmount > 0
    ? { type: discountInput.type, value: discountInput.value, amount: discountAmount, reason: discountInput.reason }
    : null;

  return { items, subtotal, taxRate, taxAmount, tipAmount, total, discount };
}

export const initialOrderState: OrderState = {
  items: [],
  subtotal: 0,
  taxRate: 0,
  taxAmount: 0,
  tipAmount: 0,
  total: 0,
  discount: null,
};

export function orderReducer(state: OrderState, action: OrderAction): OrderState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const incoming = action.payload;
      const mods = incoming.modifiers ?? [];
      const addQty = Math.max(1, incoming.quantity ?? 1);
      // Items only merge if they have the SAME itemId AND the SAME set of
      // selected modifiers. Customized items always create a new line —
      // "2 plain burgers + 1 burger with avocado" is 2 lines, not 1.
      const modKey = mods.length === 0 ? '' : JSON.stringify(mods.map((m) => m.name).sort());
      const existingIdx = state.items.findIndex(
        (i) => i.itemId === incoming.itemId &&
               JSON.stringify(i.modifiers.map((m) => m.name).sort()) === modKey
      );
      let newItems: OrderLineItem[];

      if (existingIdx >= 0) {
        newItems = state.items.map((i, idx) =>
          idx === existingIdx
            ? { ...i, quantity: Math.min(i.quantity + addQty, MAX_ITEM_QUANTITY) }
            : i
        );
      } else {
        newItems = [
          ...state.items,
          {
            itemId: incoming.itemId,
            itemName: incoming.itemName,
            itemPrice: incoming.itemPrice,
            quantity: Math.min(addQty, MAX_ITEM_QUANTITY),
            modifiers: mods,
            isTaxable: incoming.isTaxable ?? true,
          },
        ];
      }
      return recalculate(newItems, state.taxRate, state.tipAmount, state.discount);
    }

    case 'UPDATE_LINE': {
      // Replaces a line's modifiers + quantity in place. No merge with sibling
      // lines — keeps user-edited lines predictable in the cart.
      const { lineIndex, modifiers, quantity } = action.payload;
      const safeQty = Math.max(1, Math.min(quantity, MAX_ITEM_QUANTITY));
      const newItems = state.items.map((i, idx) =>
        idx === lineIndex ? { ...i, modifiers, quantity: safeQty } : i
      );
      return recalculate(newItems, state.taxRate, state.tipAmount, state.discount);
    }

    case 'REMOVE_ITEM': {
      const newItems = state.items.filter((_, idx) => idx !== action.payload.lineIndex);
      return recalculate(newItems, state.taxRate, state.tipAmount, state.discount);
    }

    case 'INCREMENT_ITEM': {
      const newItems = state.items.map((i, idx) =>
        idx === action.payload.lineIndex
          ? { ...i, quantity: Math.min(i.quantity + 1, MAX_ITEM_QUANTITY) }
          : i
      );
      return recalculate(newItems, state.taxRate, state.tipAmount, state.discount);
    }

    case 'DECREMENT_ITEM': {
      const newItems = state.items
        .map((i, idx) =>
          idx === action.payload.lineIndex ? { ...i, quantity: i.quantity - 1 } : i
        )
        .filter((i) => i.quantity > 0);
      return recalculate(newItems, state.taxRate, state.tipAmount, state.discount);
    }

    case 'SET_TIP': {
      return recalculate(state.items, state.taxRate, action.payload.amount, state.discount);
    }

    case 'SET_TAX_RATE': {
      return recalculate(state.items, action.payload.rate, state.tipAmount, state.discount);
    }

    case 'SET_DISCOUNT': {
      return recalculate(state.items, state.taxRate, state.tipAmount, action.payload);
    }

    case 'CLEAR_DISCOUNT': {
      return recalculate(state.items, state.taxRate, state.tipAmount, null);
    }

    case 'CLEAR_ORDER': {
      return { ...initialOrderState, taxRate: state.taxRate };
    }

    default:
      return state;
  }
}

// Settings state
export interface SettingsState {
  businessName: string;
  taxRate: string;
  currency: string;
  autoBackup: string;
  receiptFooter: string;
  // Phase 2 additions
  tier: string;           // 'free' | 'paid'
  testMode: string;       // 'on' | 'off'
  isOnline: string;       // 'true' | 'false'
  userEmail: string;
  stripeVerified: string; // 'true' | 'false' | 'pending'
  // TTPOi
  ttpOiSetupComplete: string; // 'true' | 'false'
  // QSR mode — when 'on', Order screen shows the CategoryStrip + filter.
  // Default 'off' so coffee shops and other single-menu merchants don't see
  // category UI they don't need. Merchants opt in via Settings.
  qsrMode: string;            // 'on' | 'off'
}

export type SettingsAction =
  | { type: 'SET_SETTING'; payload: { key: keyof SettingsState; value: string } }
  | { type: 'LOAD_SETTINGS'; payload: SettingsState };

export const initialSettingsState: SettingsState = {
  businessName: '',
  taxRate: '0',
  currency: 'USD',
  autoBackup: 'on',
  receiptFooter: '',
  tier: 'free',
  testMode: 'off',
  isOnline: 'true',
  userEmail: '',
  stripeVerified: 'true',
  ttpOiSetupComplete: 'false',
  qsrMode: 'off',
};

export function settingsReducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case 'SET_SETTING':
      return { ...state, [action.payload.key]: action.payload.value };
    case 'LOAD_SETTINGS':
      return action.payload;
    default:
      return state;
  }
}
