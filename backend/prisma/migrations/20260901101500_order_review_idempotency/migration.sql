-- AddColumns
ALTER TABLE `order_reviews`
  ADD COLUMN `idempotency_key` VARCHAR(191) NULL,
  ADD COLUMN `request_fingerprint` CHAR(64) NULL;

-- Backfill historical immutable reviews with deterministic values before enforcing NOT NULL.
UPDATE `order_reviews`
SET
  `idempotency_key` = CONCAT('legacy-order-review:', `id`),
  `request_fingerprint` = SHA2(CONCAT('legacy-order-review:', `id`), 256)
WHERE `idempotency_key` IS NULL OR `request_fingerprint` IS NULL;

-- EnforceColumns
ALTER TABLE `order_reviews`
  MODIFY `idempotency_key` VARCHAR(191) NOT NULL,
  MODIFY `request_fingerprint` CHAR(64) NOT NULL,
  ADD UNIQUE INDEX `order_reviews_idempotency_key_key`(`idempotency_key`);

-- Use byte-exact storage uniqueness while the application enforces NFKC + Unicode case-fold semantics.
ALTER TABLE `order_review_tags`
  MODIFY `label` VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
