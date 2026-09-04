-- A customer service review contributes to both the assigned technician and the
-- fulfilled shop. Backfill shop summaries from the same completed-order review
-- evidence used by the transactional write path.
UPDATE `review_summaries` AS `summary`
INNER JOIN (
  SELECT
    `booking_order`.`shop_id` AS `shop_id`,
    ROUND(AVG(`review`.`rating`), 2) AS `rating_average`,
    COUNT(*) AS `review_count`,
    MAX(`review`.`created_at`) AS `latest_review_at`
  FROM `order_reviews` AS `review`
  INNER JOIN `booking_orders` AS `booking_order`
    ON `booking_order`.`id` = `review`.`booking_order_id`
   AND `booking_order`.`deleted_at` IS NULL
  WHERE `review`.`target_type` = 'technician'
    AND `review`.`deleted_at` IS NULL
  GROUP BY `booking_order`.`shop_id`
) AS `aggregate`
  ON `summary`.`target_type` = 'shop'
 AND `summary`.`target_id` = `aggregate`.`shop_id`
SET
  `summary`.`shop_id` = `aggregate`.`shop_id`,
  `summary`.`rating_average` = `aggregate`.`rating_average`,
  `summary`.`review_count` = `aggregate`.`review_count`,
  `summary`.`latest_review_at` = `aggregate`.`latest_review_at`,
  `summary`.`deleted_at` = NULL,
  `summary`.`updated_at` = CURRENT_TIMESTAMP(3);

INSERT INTO `review_summaries` (
  `target_type`,
  `target_id`,
  `shop_id`,
  `service_id`,
  `technician_profile_id`,
  `customer_profile_id`,
  `rating_average`,
  `review_count`,
  `latest_review_at`,
  `highlights`,
  `created_at`,
  `updated_at`,
  `deleted_at`
)
SELECT
  'shop',
  `aggregate`.`shop_id`,
  `aggregate`.`shop_id`,
  NULL,
  NULL,
  NULL,
  `aggregate`.`rating_average`,
  `aggregate`.`review_count`,
  `aggregate`.`latest_review_at`,
  JSON_ARRAY(),
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3),
  NULL
FROM (
  SELECT
    `booking_order`.`shop_id` AS `shop_id`,
    ROUND(AVG(`review`.`rating`), 2) AS `rating_average`,
    COUNT(*) AS `review_count`,
    MAX(`review`.`created_at`) AS `latest_review_at`
  FROM `order_reviews` AS `review`
  INNER JOIN `booking_orders` AS `booking_order`
    ON `booking_order`.`id` = `review`.`booking_order_id`
   AND `booking_order`.`deleted_at` IS NULL
  WHERE `review`.`target_type` = 'technician'
    AND `review`.`deleted_at` IS NULL
  GROUP BY `booking_order`.`shop_id`
) AS `aggregate`
WHERE NOT EXISTS (
  SELECT 1
  FROM `review_summaries` AS `existing`
  WHERE `existing`.`target_type` = 'shop'
    AND `existing`.`target_id` = `aggregate`.`shop_id`
);
