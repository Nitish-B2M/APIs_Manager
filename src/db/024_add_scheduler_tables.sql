-- AntiGravity Scheduler Migration

-- 1. Scheduler Settings
CREATE TABLE IF NOT EXISTS scheduler_settings (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    buffer_before INTEGER DEFAULT 10,
    buffer_after INTEGER DEFAULT 10,
    focus_time_goal INTEGER DEFAULT 120, -- minutes per day
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Scheduler Tasks
CREATE TABLE IF NOT EXISTS scheduler_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID REFERENCES users (id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
    duration_minutes INTEGER DEFAULT 30,
    deadline TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'planned', -- planned, active, completed, deferred
    scheduled_start TIMESTAMP WITH TIME ZONE,
    scheduled_end TIMESTAMP WITH TIME ZONE,
    is_flexible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Scheduler Habits
CREATE TABLE IF NOT EXISTS scheduler_habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID REFERENCES users (id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    frequency VARCHAR(50) DEFAULT 'daily', -- daily, weekly, monthly
    duration_minutes INTEGER DEFAULT 30,
    preferred_window VARCHAR(50) DEFAULT 'morning', -- morning, afternoon, evening, any
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Scheduler Events (Merged View)
CREATE TABLE IF NOT EXISTS scheduler_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID REFERENCES users (id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    source VARCHAR(50) DEFAULT 'internal', -- internal, google, outlook, agora
    external_id VARCHAR(255),
    is_smart_block BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}', -- stores agora channel, tokens, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add trigger function to update updatedAt
CREATE OR REPLACE FUNCTION update_scheduler_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at trigger logic for all tables
DROP TRIGGER IF EXISTS update_scheduler_settings_modtime ON scheduler_settings;

CREATE TRIGGER update_scheduler_settings_modtime BEFORE UPDATE ON scheduler_settings FOR EACH ROW EXECUTE FUNCTION update_scheduler_updated_at();

DROP TRIGGER IF EXISTS update_scheduler_tasks_modtime ON scheduler_tasks;

CREATE TRIGGER update_scheduler_tasks_modtime BEFORE UPDATE ON scheduler_tasks FOR EACH ROW EXECUTE FUNCTION update_scheduler_updated_at();

DROP TRIGGER IF EXISTS update_scheduler_habits_modtime ON scheduler_habits;

CREATE TRIGGER update_scheduler_habits_modtime BEFORE UPDATE ON scheduler_habits FOR EACH ROW EXECUTE FUNCTION update_scheduler_updated_at();

DROP TRIGGER IF EXISTS update_scheduler_events_modtime ON scheduler_events;

CREATE TRIGGER update_scheduler_events_modtime BEFORE UPDATE ON scheduler_events FOR EACH ROW EXECUTE FUNCTION update_scheduler_updated_at();