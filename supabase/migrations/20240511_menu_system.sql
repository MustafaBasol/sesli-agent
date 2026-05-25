-- Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    category TEXT, -- Starter, Main, Dessert, Drink, etc.
    price DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'TRY',
    description TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initial Menu Seed (Optional)
INSERT INTO menu_items (name, category, price, description) VALUES 
('Golden Meat Special Steak', 'Main', 1250, 'Our signature dry-aged steak with gold leaf.'),
('Lamb Chops', 'Main', 850, 'Tender lamb chops with rosemary.'),
('Hummus with Pastirma', 'Starter', 320, 'Traditional hummus topped with spicy pastirma.'),
('Baklava with Pistachio', 'Dessert', 280, 'Freshly made crispy baklava.'),
('Turkish Tea', 'Drink', 40, 'Premium black tea.')
ON CONFLICT DO NOTHING;
