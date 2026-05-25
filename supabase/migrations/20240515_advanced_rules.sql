-- Expand Restaurant Settings for more rules
ALTER TABLE restaurant_settings ADD COLUMN IF NOT EXISTS last_reservation_offset_minutes INTEGER DEFAULT 60; -- e.g. 60 mins before close

-- Global Restaurant Rules Table
CREATE TABLE IF NOT EXISTS restaurant_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial rules
INSERT INTO restaurant_rules (key, value, description) VALUES 
('max_party_size', '12', 'Maximum number of people for a single reservation'),
('manual_approval_threshold', '8', 'Reservations above this size require manual staff approval'),
('auto_confirm', 'true', 'Whether to auto-confirm reservations if table is available'),
('reservation_interval_minutes', '30', 'Interval between available reservation slots')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
