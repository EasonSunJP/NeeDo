ALTER TABLE `order_checkouts`
  DROP CHECK `order_checkouts_total_chk`,
  ADD CONSTRAINT `order_checkouts_total_chk` CHECK (
    `checkout_amount_jpy` =
      `base_amount_jpy` +
      `add_on_amount_jpy` +
      `travel_fare_amount_jpy` -
      `discount_amount_jpy`
  );
