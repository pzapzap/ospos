-- Convert all money columns from NUMERIC(10,2) dollars to INTEGER cents
-- This matches the client-side migration (SQLite MIGRATION_V4)

-- synced_orders: convert dollar values to cents, then change column type
ALTER TABLE synced_orders
  ALTER COLUMN subtotal TYPE INTEGER USING ROUND(subtotal * 100)::INTEGER,
  ALTER COLUMN tax_amount TYPE INTEGER USING ROUND(tax_amount * 100)::INTEGER,
  ALTER COLUMN tip_amount TYPE INTEGER USING ROUND(tip_amount * 100)::INTEGER,
  ALTER COLUMN total TYPE INTEGER USING ROUND(total * 100)::INTEGER,
  ALTER COLUMN refund_amount TYPE INTEGER USING ROUND(refund_amount * 100)::INTEGER;

-- synced_order_items: convert item_price
ALTER TABLE synced_order_items
  ALTER COLUMN item_price TYPE INTEGER USING ROUND(item_price * 100)::INTEGER;

-- dispute_records: convert amount
ALTER TABLE dispute_records
  ALTER COLUMN amount TYPE INTEGER USING ROUND(amount * 100)::INTEGER;

INSERT INTO schema_migrations (version) VALUES (2);
