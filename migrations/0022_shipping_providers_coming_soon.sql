-- Keep selected courier integrations unavailable until they are ready for store use.
UPDATE shipping_methods
SET is_enabled = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE provider_type IN ('courier_guy', 'postnet', 'bobgo');
