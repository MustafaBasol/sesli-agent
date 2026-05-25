-- 1. Customers Table (CRM)
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT UNIQUE NOT NULL,
    full_name TEXT,
    total_reservations INTEGER DEFAULT 0,
    last_visit_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tables Table (Physical Tables)
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_number TEXT UNIQUE NOT NULL,
    capacity INTEGER NOT NULL,
    location TEXT, -- e.g., 'Window', 'Terrace', 'Main Hall'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Update Reservation Requests to link with Table and Customer
ALTER TABLE reservation_requests ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);
ALTER TABLE reservation_requests ADD COLUMN IF NOT EXISTS assigned_table_id UUID REFERENCES tables(id);

-- 4. Triggers for updated_at
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 5. Seed initial tables (Optional, you can add more via Admin)
INSERT INTO tables (table_number, capacity, location) VALUES 
('T1', 2, 'Window'),
('T2', 2, 'Window'),
('T3', 4, 'Main Hall'),
('T4', 6, 'Terrace'),
('T5', 2, 'Main Hall')
ON CONFLICT DO NOTHING;
