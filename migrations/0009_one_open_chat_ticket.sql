-- Keep one open support ticket per customer and merge existing duplicate open tickets.
WITH ranked AS (
  SELECT
    id AS old_id,
    FIRST_VALUE(id) OVER (
      PARTITION BY customer_firebase_uid
      ORDER BY updated_at DESC, id DESC
    ) AS keeper_id
  FROM conversations
  WHERE status = 'open'
)
UPDATE conversation_messages
SET conversation_id = (
  SELECT keeper_id FROM ranked
  WHERE old_id = conversation_messages.conversation_id
)
WHERE conversation_id IN (
  SELECT old_id FROM ranked WHERE old_id != keeper_id
);

WITH ranked AS (
  SELECT
    id AS old_id,
    FIRST_VALUE(id) OVER (
      PARTITION BY customer_firebase_uid
      ORDER BY updated_at DESC, id DESC
    ) AS keeper_id
  FROM conversations
  WHERE status = 'open'
)
DELETE FROM conversations
WHERE id IN (
  SELECT old_id FROM ranked WHERE old_id != keeper_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_one_open_per_customer
  ON conversations (customer_firebase_uid)
  WHERE status = 'open';
