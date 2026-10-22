-- Preserve the meaning of legacy reseller sales marked paid before payment history existed.
-- Pending sales remain unpaid and are intentionally not backfilled.
INSERT INTO reseller_customer_payments
  (reseller_order_id, amount, payment_date, payment_method, payment_reference, notes)
SELECT o.id, o.subtotal, o.created_at, 'legacy record', '', 'Imported from the previous paid status; original payment details were not recorded.'
FROM reseller_orders o
WHERE o.payment_status = 'paid'
  AND o.subtotal > 0
  AND NOT EXISTS (
    SELECT 1 FROM reseller_customer_payments p WHERE p.reseller_order_id = o.id
  );
