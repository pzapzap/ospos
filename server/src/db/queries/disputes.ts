import { query, queryOne } from '../connection';

export interface DisputeRecord {
  id: string;
  user_id: string;
  stripe_dispute_id: string;
  stripe_payment_id: string;
  amount: number;
  reason: string | null;
  status: string;
  evidence_submitted: boolean;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export async function createDisputeRecord(
  userId: string,
  stripeDisputeId: string,
  stripePaymentId: string,
  amount: number,
  reason: string | null,
  deadline: string | null
): Promise<DisputeRecord> {
  const rows = await query<DisputeRecord>(
    `INSERT INTO dispute_records (user_id, stripe_dispute_id, stripe_payment_id, amount, reason, status, deadline)
     VALUES ($1, $2, $3, $4, $5, 'needs_response', $6)
     RETURNING *`,
    [userId, stripeDisputeId, stripePaymentId, amount, reason, deadline]
  );
  return rows[0];
}

export async function getDisputesByUser(userId: string): Promise<DisputeRecord[]> {
  return query<DisputeRecord>(
    'SELECT * FROM dispute_records WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
}

export async function getDisputeById(id: string): Promise<DisputeRecord | null> {
  return queryOne<DisputeRecord>(
    'SELECT * FROM dispute_records WHERE id = $1',
    [id]
  );
}

export async function getDisputeByStripeId(
  stripeDisputeId: string
): Promise<DisputeRecord | null> {
  return queryOne<DisputeRecord>(
    'SELECT * FROM dispute_records WHERE stripe_dispute_id = $1',
    [stripeDisputeId]
  );
}

export async function updateDisputeStatus(
  stripeDisputeId: string,
  status: string
): Promise<void> {
  await query(
    'UPDATE dispute_records SET status = $1, updated_at = NOW() WHERE stripe_dispute_id = $2',
    [status, stripeDisputeId]
  );
}

export async function markEvidenceSubmitted(disputeId: string): Promise<void> {
  await query(
    'UPDATE dispute_records SET evidence_submitted = TRUE, updated_at = NOW() WHERE id = $1',
    [disputeId]
  );
}
