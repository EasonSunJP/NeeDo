UPDATE `shops` AS `shop`
INNER JOIN `shop_finance_rule_sets` AS `rule_set`
  ON `rule_set`.`id` = (
    SELECT MAX(`candidate`.`id`)
    FROM `shop_finance_rule_sets` AS `candidate`
    WHERE `candidate`.`shop_id` = `shop`.`id`
      AND `candidate`.`status` = 'active'
      AND `candidate`.`deleted_at` IS NULL
  )
SET `shop`.`technician_pricing_rate_percent` = ROUND(`rule_set`.`commission_rate_bps` / 100);

UPDATE `shops`
SET `technician_pricing_rate_percent` = 100
WHERE `technician_pricing_rate_percent` > 100;

UPDATE `shops`
SET `technician_pricing_rate_percent` = 10
WHERE `technician_pricing_rate_percent` < 10;

ALTER TABLE `shops`
  ADD CONSTRAINT `shops_technician_pricing_rate_percent_check`
  CHECK (`technician_pricing_rate_percent` BETWEEN 10 AND 100);
