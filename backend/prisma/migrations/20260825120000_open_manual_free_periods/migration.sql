-- Allow an administratively locked free period to remain open until the lock is released.
ALTER TABLE `saas_free_periods`
    MODIFY `ends_at` DATETIME(3) NULL;
