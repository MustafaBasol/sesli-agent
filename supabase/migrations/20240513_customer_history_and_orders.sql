-- Orders Table (Linked to Reservations)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID REFERENCES reservation_requests(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price DECIMAL(10, 2),
    total_price DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure calls are linked to customers (by phone_number or customer_id)
-- We'll use a view or join for this, but let's add a customer_id column to calls for better performance
ALTER TABLE calls ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- Update existing calls to link to customers if possible
UPDATE calls SET customer_id = customers.id 
FROM customers WHERE calls.caller_phone = customers.phone_number;
