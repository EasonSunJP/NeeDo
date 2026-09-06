ALTER TABLE `order_refund_case_events`
  MODIFY `idempotency_key` VARCHAR(160) NOT NULL;

ALTER TABLE `order_refund_dispute_revisions`
  MODIFY `idempotency_key` VARCHAR(160) NOT NULL;
