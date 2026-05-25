-- Security Migration: Enable Row Level Security on all tables
-- Backend (API routes) must use the SERVICE_ROLE key which bypasses RLS.
-- The ANON key used in the browser client will be denied by these policies.
-- This migration is idempotent and safe to run multiple times.

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE calls              ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_changes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_handoffs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables             ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackout_dates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DROP ANY EXISTING PERMISSIVE DEFAULT POLICIES
-- ============================================================

DROP POLICY IF EXISTS allow_anon_all ON calls;
DROP POLICY IF EXISTS allow_anon_all ON reservation_requests;
DROP POLICY IF EXISTS allow_anon_all ON reservation_changes;
DROP POLICY IF EXISTS allow_anon_all ON reservation_cancellations;
DROP POLICY IF EXISTS allow_anon_all ON staff_handoffs;
DROP POLICY IF EXISTS allow_anon_all ON tool_logs;
DROP POLICY IF EXISTS allow_anon_all ON customers;
DROP POLICY IF EXISTS allow_anon_all ON tables;
DROP POLICY IF EXISTS allow_anon_all ON menu_items;
DROP POLICY IF EXISTS allow_anon_all ON menu_categories;
DROP POLICY IF EXISTS allow_anon_all ON restaurant_settings;
DROP POLICY IF EXISTS allow_anon_all ON blackout_dates;
DROP POLICY IF EXISTS allow_anon_all ON restaurant_rules;
DROP POLICY IF EXISTS allow_anon_all ON orders;

-- ============================================================
-- DENY ALL ANONYMOUS/PUBLIC ACCESS
-- No row-level policies are created for the public/anon role.
-- All data access is performed via the service_role key on the server,
-- which automatically bypasses RLS.
-- ============================================================

-- Public read for menu items and categories (safe for unauthenticated web widgets)
-- Uncomment if you want public menu display:
-- CREATE POLICY "menu_items_public_read" ON menu_items FOR SELECT USING (is_available = true);
-- CREATE POLICY "menu_categories_public_read" ON menu_categories FOR SELECT USING (true);
