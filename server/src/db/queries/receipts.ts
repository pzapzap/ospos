import { query } from '../connection';

export interface ReceiptLog {
  id: string;
  user_id: string;
  order_id: string;
  method: 'sms' | 'email';
  recipient: string;
  status: string;
  created_at: string;
}

export async function createReceiptLog(
  userId: string,
  orderId: string,
  method: 'sms' | 'email',
  recipient: string
): Promise<ReceiptLog> {
  const rows = await query<ReceiptLog>(
    `INSERT INTO receipt_logs (user_id, order_id, method, recipient, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING *`,
    [userId, orderId, method, recipient]
  );
  return rows[0];
}

export async function updateReceiptStatus(
  id: string,
  status: string
): Promise<void> {
  await query(
    'UPDATE receipt_logs SET status = $1 WHERE id = $2',
    [status, id]
  );
}
