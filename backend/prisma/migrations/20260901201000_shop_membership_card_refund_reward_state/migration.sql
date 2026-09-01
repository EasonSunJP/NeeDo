ALTER TABLE `shop_membership_card_redemptions`
  DROP CHECK `shop_membership_card_redemptions_reward_state`,
  ADD CONSTRAINT `shop_membership_card_redemptions_reward_state`
    CHECK (
      (`reward_status` = 'none' AND `total_shop_debit_ndp` = 0
        AND `outstanding_reward_ndp` = 0 AND `ledger_transaction_id` IS NULL
        AND `shop_wallet_id` IS NULL AND `customer_wallet_id` IS NULL
        AND `platform_wallet_id` IS NULL AND `reward_settled_at` IS NULL)
      OR (`reward_status` = 'pending_funds' AND `outstanding_reward_ndp` = `total_shop_debit_ndp`
        AND `total_shop_debit_ndp` > 0 AND `ledger_transaction_id` IS NULL
        AND `reward_settled_at` IS NULL)
      OR (`reward_status` = 'paid' AND `outstanding_reward_ndp` = 0 AND `ledger_transaction_id` IS NOT NULL
        AND `shop_wallet_id` IS NOT NULL AND `customer_wallet_id` IS NOT NULL
        AND ((`platform_fee_ndp` = 0 AND `platform_wallet_id` IS NULL)
          OR (`platform_fee_ndp` > 0 AND `platform_wallet_id` IS NOT NULL))
        AND `reward_settled_at` IS NOT NULL)
      OR (`reward_status` = 'reversed' AND `outstanding_reward_ndp` = 0
        AND (
          (`total_shop_debit_ndp` > 0 AND `ledger_transaction_id` IS NULL
            AND `shop_wallet_id` IS NULL AND `customer_wallet_id` IS NULL
            AND `platform_wallet_id` IS NULL AND `reward_settled_at` IS NULL)
          OR
          (`ledger_transaction_id` IS NOT NULL
            AND `shop_wallet_id` IS NOT NULL AND `customer_wallet_id` IS NOT NULL
            AND ((`platform_fee_ndp` = 0 AND `platform_wallet_id` IS NULL)
              OR (`platform_fee_ndp` > 0 AND `platform_wallet_id` IS NOT NULL))
            AND `reward_settled_at` IS NOT NULL)
        ))
    );
