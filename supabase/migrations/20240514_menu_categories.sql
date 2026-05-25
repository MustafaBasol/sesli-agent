-- Menu Categories Table
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial categories from current menu
INSERT INTO menu_categories (name, display_order) VALUES 
('Soups', 1),
('Cold Starters', 2),
('Grilled Meats', 3),
('Kebabs', 4),
('Chicken', 5),
('Pides', 6),
('Desserts', 7),
('Hot Drinks', 8),
('Soft Drinks', 9)
ON CONFLICT (name) DO NOTHING;
