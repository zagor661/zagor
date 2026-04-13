-- ============================================
-- KitchenOps: Task Response Flow + Chat
-- Run in Supabase SQL Editor
-- ============================================

-- 1) Add status columns to worker_tasks
ALTER TABLE worker_tasks
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS problem_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS problem_description TEXT;

-- Status values: 'new' → 'read' → 'in_progress' → 'done' | 'problem'

-- 2) Task messages (mini-chat)
CREATE TABLE IF NOT EXISTS task_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES worker_tasks(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id),
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_messages_task_id ON task_messages(task_id);

-- 3) Enable RLS
ALTER TABLE task_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_messages_select" ON task_messages FOR SELECT USING (true);
CREATE POLICY "task_messages_insert" ON task_messages FOR INSERT WITH CHECK (true);

-- 4) Backfill: mark existing completed tasks as 'done', rest as 'new'
UPDATE worker_tasks SET status = 'done' WHERE is_completed = true AND status = 'new';
