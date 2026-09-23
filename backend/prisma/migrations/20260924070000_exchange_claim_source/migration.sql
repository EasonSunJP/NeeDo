ALTER TABLE `exchange_claims`
  ADD COLUMN `source` VARCHAR(24) NOT NULL DEFAULT 'manual';

UPDATE `exchange_claims` AS claim
INNER JOIN `technician_automation_decision_logs` AS decision
  ON decision.`idempotency_key` = claim.`idempotency_key`
SET claim.`source` = 'automatic'
WHERE decision.`kind` = 'REQUEST'
  AND decision.`target_type` = 'exchange_request'
  AND decision.`action_type` = 'apply_request';

UPDATE `exchange_claims` AS claim
INNER JOIN `user_identities` AS identity
  ON identity.`id` = claim.`claimant_identity_id`
SET claim.`source` = 'shop_dispatch'
WHERE claim.`source` = 'manual'
  AND identity.`type` IN ('merchant', 'merchant_owner', 'merchant_staff', 'merchant_organization', 'business');
