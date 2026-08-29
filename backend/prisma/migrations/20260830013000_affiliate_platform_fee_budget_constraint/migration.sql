-- The historical constraint treated reserved_budget_ndp as commission-only.
-- Affiliate fee snapshots make it the gross reserve, while allocation counters stay commission-only.
ALTER TABLE `affiliate_tasks`
  DROP CHECK `affiliate_tasks_budget_check`,
  ADD CONSTRAINT `affiliate_tasks_budget_check`
  CHECK (
    `reward_ndp_per_completed_order` > 0
    AND `total_budget_ndp` > 0
    AND `total_budget_ndp` >= `reward_ndp_per_completed_order`
    AND `reserved_budget_ndp` >= 0
    AND `allocated_budget_ndp` >= 0
    AND `settled_budget_ndp` >= 0
    AND `released_budget_ndp` >= 0
    AND `allocated_budget_ndp` + `settled_budget_ndp` + `released_budget_ndp` <= `total_budget_ndp`
    AND `reserved_budget_ndp` <= `total_budget_ndp` + `platform_fee_reserve_ndp`
  );
