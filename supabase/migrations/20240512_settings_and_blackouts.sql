-- Restaurant Settings (Opening Hours)
CREATE TABLE IF NOT EXISTS restaurant_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    day_of_week INTEGER NOT NULL, -- 0 (Sun) to 6 (Sat)
    open_time TIME NOT NULL DEFAULT '09:00',
    close_time TIME NOT NULL DEFAULT '22:00',
    is_closed BOOLEAN DEFAULT FALSE,
    UNIQUE(day_of_week)
);

-- Blackout Dates (Holidays/Closed Days)
CREATE TABLE IF NOT EXISTS blackout_dates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE UNIQUE NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial hours
INSERT INTO restaurant_settings (day_of_week, open_time, close_time) VALUES 
(1, '09:00', '22:00'),
(2, '09:00', '22:00'),
(3, '09:00', '22:00'),
(4, '09:00', '22:00'),
(5, '09:00', '23:00'),
(6, '10:00', '23:00'),
(0, '10:00', '21:00')
ON CONFLICT (day_of_week) DO NOTHING;
