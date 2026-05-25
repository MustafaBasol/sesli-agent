-- SQL Migration: Golden Meat Restaurant Inbound Call System
-- Tables: calls, reservation_requests, reservation_changes, reservation_cancellations, staff_handoffs, tool_logs

-- 1. Calls table
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vapi_call_id TEXT UNIQUE,
    caller_phone TEXT,
    customer_name TEXT,
    language TEXT,
    intent TEXT,
    summary TEXT,
    outcome TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Reservation Requests table
CREATE TABLE IF NOT EXISTS reservation_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    vapi_call_id TEXT,
    customer_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    language TEXT,
    special_request TEXT,
    status TEXT DEFAULT 'new', -- new, seen, confirmed, rejected, cancelled, done
    internal_note TEXT,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Reservation Changes table
CREATE TABLE IF NOT EXISTS reservation_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    vapi_call_id TEXT,
    customer_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    original_reservation_date DATE,
    original_reservation_time TIME,
    new_reservation_date DATE NOT NULL,
    new_reservation_time TIME NOT NULL,
    party_size INTEGER,
    language TEXT,
    note TEXT,
    status TEXT DEFAULT 'new',
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Reservation Cancellations table
CREATE TABLE IF NOT EXISTS reservation_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    vapi_call_id TEXT,
    customer_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    reservation_date DATE,
    reservation_time TIME,
    language TEXT,
    reason TEXT,
    status TEXT DEFAULT 'new',
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Staff Handoffs table
CREATE TABLE IF NOT EXISTS staff_handoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
    vapi_call_id TEXT,
    customer_name TEXT,
    phone_number TEXT NOT NULL,
    language TEXT,
    reason TEXT NOT NULL,
    conversation_summary TEXT NOT NULL,
    urgency TEXT DEFAULT 'normal', -- low, normal, high
    status TEXT DEFAULT 'new', -- new, seen, contacted, done
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tool Logs table
CREATE TABLE IF NOT EXISTS tool_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vapi_call_id TEXT,
    tool_name TEXT NOT NULL,
    request_payload JSONB,
    response_payload JSONB,
    status TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_calls_updated_at BEFORE UPDATE ON calls FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_reservation_requests_updated_at BEFORE UPDATE ON reservation_requests FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_reservation_changes_updated_at BEFORE UPDATE ON reservation_changes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_reservation_cancellations_updated_at BEFORE UPDATE ON reservation_cancellations FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
CREATE TRIGGER update_staff_handoffs_updated_at BEFORE UPDATE ON staff_handoffs FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id ON calls(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at);
CREATE INDEX IF NOT EXISTS idx_res_req_vapi_call_id ON reservation_requests(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_res_req_date ON reservation_requests(reservation_date);
CREATE INDEX IF NOT EXISTS idx_res_req_status ON reservation_requests(status);
CREATE INDEX IF NOT EXISTS idx_res_chg_vapi_call_id ON reservation_changes(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_res_can_vapi_call_id ON reservation_cancellations(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_staff_handoff_vapi_call_id ON staff_handoffs(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_vapi_call_id ON tool_logs(vapi_call_id);
