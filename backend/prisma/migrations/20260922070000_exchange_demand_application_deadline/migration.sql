-- Keep existing Demand and Intelligence rows valid. New Demand publications use
-- an application deadline before the service starts; API validation rejects
-- the legacy post-service-end form for new Demand records.
ALTER TABLE `exchange_posts`
  DROP CHECK `exchange_posts_service_window_check`,
  ADD CONSTRAINT `exchange_posts_service_window_check`
    CHECK (
      `service_start_at` < `service_end_at`
      AND (
        (`type` = 'demand' AND `expires_at` < `service_start_at`)
        OR `service_end_at` <= `expires_at`
      )
    );
