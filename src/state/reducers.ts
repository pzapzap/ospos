// Order state and settings state reducers
// All money values (itemPrice, subtotal, taxAmount, tipAmount, total) are integer cents.
import { MAX_ITEM_QUANTITY } from '../utils/validation';

export interface OrderLineItem {
  itemId: string;
  itemName: string;
  itemPrice: number;
  quantity: number;
}

export interface OrderState {
  items: OrderLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
}

export type OrderAction =
  | { type: 'ADD_ITEM'; payload: { itemId: string; itemName: string; itemPrice: number } }
  | { type: 'REMOVE_ITEM'; payload: { itemId: string } }
  | { type: 'INCREMENT_ITEM'; payload: { itemId: string } }
  | { type: 'DECREMENT_ITEM'; payload: { itemId: string } }
  | { type: 'SET_TIP'; payload: { amount: number } }
  | { type: 'SET_TAX_RATE'; payload: { rate: number } }
  | { type: 'CLEAR_ORDER' };

function recalculate(items: OrderLineItem[], taxRate: number, tipAmount: number): OrderState {
  const subtotal = items.reduce((sum, item) => sum + item.itemPrice * item.quantity, 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + taxAmount + tipAmount;

  return { items, subtotal, taxRate, taxAmount, tipAmount, total };
}

export const initialOrderState: OrderState = {
  items: [],
  subtotal: 0,
  taxRate: 0,
  taxAmount: 0,
  tipAmount: 0,
  total: 0,
};

export function orderReducer(state: OrderState, action: OrderAction): OrderState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.itemId === action.payload.itemId);
      let newItems: OrderLineItem[];

      if (existing) {
        newItems = state.items.map((i) =>
          i.itemId === action.payload.itemId
            ? { ...i, quantity: Math.min(i.quantity + 1, MAX_ITEM_QUANTITY) }
            : i
        );
      } else {
        newItems = [
          ...state.items,
          {
            itemId: action.payload.itemId,
            itemName: action.payload.itemName,
            itemPrice: action.payload.itemPrice,
            quantity: 1,
          },
        ];
      }
      return recalculate(newItems, state.taxRate, state.tipAmount);
    }

    case 'REMOVE_ITEM': {
      const newItems = state.items.filter((i) => i.itemId !== action.payload.itemId);
      return recalculate(newItems, state.taxRate, state.tipAmount);
    }

    case 'INCREMENT_ITEM': {
      const newItems = state.items.map((i) =>
        i.itemId === action.payload.itemId
          ? { ...i, quantity: Math.min(i.quantity + 1, MAX_ITEM_QUANTITY) }
          : i
      );
      return recalculate(newItems, state.taxRate, state.tipAmount);
    }

    case 'DECREMENT_ITEM': {
      const newItems = state.items
        .map((i) =>
          i.itemId === action.payload.itemId ? { ...i, quantity: i.quantity - 1 } : i
        )
        .filter((i) => i.quantity > 0);
      return recalculate(newItems, state.taxRate, state.tipAmount);
    }

    case 'SET_TIP': {
      return recalculate(state.items, state.taxRate, action.payload.amount);
    }

    case 'SET_TAX_RATE': {
      return recalculate(state.items, action.payload.rate, state.tipAmount);
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
