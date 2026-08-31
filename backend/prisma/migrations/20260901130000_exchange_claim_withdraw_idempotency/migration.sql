ALTER TABLE `exchange_claims`
  ADD COLUMN `withdrawal_idempotency_key` VARCHAR(191) NULL,
  ADD COLUMN `withdrawal_payload_fingerprint` CHAR(64) NULL,
  ADD CONSTRAINT `exchange_claims_withdrawal_idem_pair`
    CHECK (
      (`withdrawal_idempotency_key` IS NULL AND `withdrawal_payload_fingerprint` IS NULL)
      OR
      (`withdrawal_idempotency_key` IS NOT NULL AND `withdrawal_payload_fingerprint` IS NOT NULL)
    ),
  ADD UNIQUE INDEX `exchange_claims_withdrawal_idempotency_key_key`
    (`withdrawal_idempotency_key`);
