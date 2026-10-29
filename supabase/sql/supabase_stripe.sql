-- Stripe columns for negocios table
-- Run this in Supabase SQL Editor

ALTER TABLE negocios
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS stripe_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_price_id          TEXT;

-- Index for fast lookups by Stripe customer
CREATE INDEX IF NOT EXISTS idx_negocios_stripe_customer
  ON negocios (stripe_customer_id);

-- Only allow active subscribers to appear in public directory listings
-- (adjust to match your existing SELECT policy if needed)
-- DROP POLICY IF EXISTS "negocios_public_select" ON negocios;
-- CREATE POLICY "negocios_public_select" ON negocios
--   FOR SELECT USING (stripe_subscription_status = 'active' OR auth.uid() = usuario_id);
