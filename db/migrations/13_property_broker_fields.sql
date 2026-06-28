-- ============================================================================
-- 13_property_broker_fields.sql - richer broker-style property metadata
-- ============================================================================
-- Idempotent. Adds the extra fields used by the property form, presenter, and
-- bot prompt so real listings can carry the details agents normally share.
-- ============================================================================

alter table properties add column if not exists floor_plan_available boolean;
alter table properties add column if not exists booking_started boolean;
alter table properties add column if not exists finance_options text;
alter table properties add column if not exists area_ranking text;
alter table properties add column if not exists purchase_indicator integer;
alter table properties add column if not exists parking_available boolean;
alter table properties add column if not exists parking_details text;
alter table properties add column if not exists broker_recommendation text;

