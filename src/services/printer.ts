// ESC/POS Bluetooth thermal printer service
// Supports Star TSP143III and common ESC/POS Bluetooth thermal printers
//
// ESC/POS Command Reference:
//   ESC @       - Initialize printer
//   ESC a n     - Set justification (0=left, 1=center, 2=right)
//   ESC E n     - Bold on/off (1=on, 0=off)
//   GS ! n      - Set character size (0x00=normal, 0x11=double)
//   ESC d n     - Print and feed n lines
//   GS V 1      - Partial cut paper
//
// To add support for other printers, implement the PrinterDriver interface
// and register it via registerDriver().

import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';

// ESC/POS command bytes
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  INIT: [ESC, 0x40] as number[],
  CENTER: [ESC, 0x61, 1] as number[],
  LEFT: [ESC, 0x61, 0] as number[],
  BOLD_ON: [ESC, 0x45, 1] as number[],
  BOLD_OFF: [ESC, 0x45, 0] as number[],
  DOUBLE_SIZE: [GS, 0x21, 0x11] as number[],
  NORMAL_SIZE: [GS, 0x21, 0x00] as number[],
  FEED_LINES: (n: number): number[] => [ESC, 0x64, n],
  CUT: [GS, 0x56, 1] as number[],
};

// Common ESC/POS printer service UUIDs
const PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic ESC/POS
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Star Micronics
];

const PRINTER_CHAR_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb', // Generic ESC/POS write
  '49535343-8841-43f4-a8d4-ecbe34729bb3', // Star Micronics write
];

let bleManager: BleManager | null = null;
let connectedPrinter: Device | null = null;
let writeCharacteristic: Characteristic | null = null;

function getManager(): BleManager {
  if (!bleManager) {
    bleManager = new BleManager();
  }
  return bleManager;
}

export interface PrinterInfo {
  id: string;
  name: string;
  connected: boolean;
}

async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return Object.values(results).every(
      (r) => r === PermissionsAndroid.RESULTS.GRANTED
    );
  }
  return true; // iOS handles via Info.plist
}

export async function scanForPrinters(timeoutMs = 8000): Promise<PrinterInfo[]> {
  const hasPermission = await requestBluetoothPermissions();
  if (!hasPermission) return [];

  const manager = getManager();
  const found: PrinterInfo[] = [];

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      manager.stopDeviceScan();
      resolve(found);
    }, timeoutMs);

    manager.startDeviceScan(null, null, (error, device) => {
      if (error || !device) return;

      // Filter for devices that look like printers
      const name = device.name ?? device.localName ?? '';
      const isPrinter =
        name.toLowerCase().includes('star') ||
        name.toLowerCase().includes('tsp') ||
        name.toLowerCase().includes('printer') ||
        name.toLowerCase().includes('pos') ||
        name.toLowerCase().includes('esc');

      if (isPrinter && !found.find((f) => f.id === device.id)) {
        found.push({
          id: device.id,
          name: name || `Printer (${device.id.slice(-6)})`,
          connected: false,
        });
      }
    });
  });
}

export async function connectPrinter(deviceId: string): Promise<boolean> {
  const manager = getManager();

  try {
    // Connect
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();

    // Find writable characteristic
    const services = await device.services();
    for (const service of services) {
      const characteristics = await service.characteristics();
      for (const char of characteristics) {
        if (char.isWritableWithResponse || char.isWritableWithoutResponse) {
          // Check if it matches known printer characteristics
          const isKnown =
            PRINTER_CHAR_UUIDS.some((uuid) =>
              char.uuid.toLowerCase().includes(uuid.toLowerCase().replace(/-/g, '').slice(0, 8))
            ) ||
            PRINTER_SERVICE_UUIDS.some((uuid) =>
              service.uuid.toLowerCase().includes(uuid.toLowerCase().replace(/-/g, '').slice(0, 8))
            );

          if (isKnown || char.isWritableWithResponse) {
            connectedPrinter = device;
            writeCharacteristic = char;
            return true;
          }
        }
      }
    }

    // Couldn't find a write characteristic
    await device.cancelConnection();
    return false;
  } catch {
    return false;
  }
}

export async function disconnectPrinter(): Promise<void> {
  if (connectedPrinter) {
    try {
      await connectedPrinter.cancelConnection();
    } catch {
      // Already disconnected
    }
    connectedPrinter = null;
    writeCharacteristic = null;
  }
}

export function isPrinterConnected(): boolean {
  return connectedPrinter !== null && writeCharacteristic !== null;
}

async function writeBytes(data: number[]): Promise<void> {
  if (!writeCharacteristic) {
    throw new Error('No printer connected');
  }

  // Convert to base64 for BLE write
  const bytes = new Uint8Array(data);
  const base64 = btoa(String.fromCharCode(...bytes));

  if (writeCharacteristic.isWritableWithResponse) {
    await writeCharacteristic.writeWithResponse(base64);
  } else {
    await writeCharacteristic.writeWithoutResponse(base64);
  }
}

function textToBytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    bytes.push(text.charCodeAt(i));
  }
  return bytes;
}

export interface ReceiptData {
  businessName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  paymentMethod: string;
  timestamp: string;
  footerText?: string;
  currencySymbol?: string;
}

export async function printReceipt(receipt: ReceiptData): Promise<void> {
  if (!isPrinterConnected()) {
    throw new Error('Printer not connected');
  }

  const sym = receipt.currencySymbol || '$';

  // Initialize printer
  await writeBytes(CMD.INIT);

  // Business name - centered, bold, double size
  await writeBytes([...CMD.CENTER, ...CMD.BOLD_ON, ...CMD.DOUBLE_SIZE]);
  await writeBytes([...textToBytes(receipt.businessName), LF]);
  await writeBytes([...CMD.NORMAL_SIZE, ...CMD.BOLD_OFF]);
  await writeBytes(CMD.FEED_LINES(1));

  // Timestamp - centered
  await writeBytes(CMD.CENTER);
  await writeBytes([...textToBytes(receipt.timestamp), LF]);
  await writeBytes(CMD.FEED_LINES(1));

  // Divider
  await writeBytes(CMD.LEFT);
  await writeBytes([...textToBytes('--------------------------------'), LF]);

  // Items - left aligned
  for (const item of receipt.items) {
    const lineTotal = (item.price * item.quantity / 100).toFixed(2);
    const line = `${item.quantity}x ${item.name}`;
    const padded = line.padEnd(24) + `${sym}${lineTotal}`.padStart(8);
    await writeBytes([...textToBytes(padded), LF]);
  }

  // Divider
  await writeBytes([...textToBytes('--------------------------------'), LF]);

  // Totals
  const subtotalLine = 'Subtotal'.padEnd(24) + `${sym}${(receipt.subtotal / 100).toFixed(2)}`.padStart(8);
  await writeBytes([...textToBytes(subtotalLine), LF]);

  if (receipt.taxAmount > 0) {
    const taxLine = 'Tax'.padEnd(24) + `${sym}${(receipt.taxAmount / 100).toFixed(2)}`.padStart(8);
    await writeBytes([...textToBytes(taxLine), LF]);
  }

  if (receipt.tipAmount > 0) {
    const tipLine = 'Tip'.padEnd(24) + `${sym}${(receipt.tipAmount / 100).toFixed(2)}`.padStart(8);
    await writeBytes([...textToBytes(tipLine), LF]);
  }

  // Total - bold
  await writeBytes(CMD.BOLD_ON);
  const totalLine = 'TOTAL'.padEnd(24) + `${sym}${(receipt.total / 100).toFixed(2)}`.padStart(8);
  await writeBytes([...textToBytes(totalLine), LF]);
  await writeBytes(CMD.BOLD_OFF);

  // Payment method
  await writeBytes(CMD.FEED_LINES(1));
  const methodLine = `Paid by: ${receipt.paymentMethod}`;
  await writeBytes([...CMD.CENTER, ...textToBytes(methodLine), LF]);

  // Footer
  if (receipt.footerText) {
    await writeBytes(CMD.FEED_LINES(1));
    await writeBytes([...CMD.CENTER, ...textToBytes(receipt.footerText), LF]);
  }

  // Thank you
  await writeBytes(CMD.FEED_LINES(1));
  await writeBytes([...CMD.CENTER, ...textToBytes('Thank you!'), LF]);

  // Feed and cut
  await writeBytes(CMD.FEED_LINES(4));
  await writeBytes(CMD.CUT);
}

// Cleanup
export function destroyBleManager(): void {
  if (bleManager) {
    bleManager.destroy();
    bleManager = null;
  }
  connectedPrinter = null;
  writeCharacteristic = null;
}
