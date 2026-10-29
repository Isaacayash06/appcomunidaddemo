-- Añadir columna para deduplicar pagos del webhook de Stripe
ALTER TABLE donaciones
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT UNIQUE;
