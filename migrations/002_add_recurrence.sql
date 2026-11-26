-- =============================================================================
-- PVA (Personal Virtual Assistant) - Migration 002: Recurrence for Tasks & Reminders
-- Hỗ trợ lặp lại công việc và nhắc nhở: none | daily | weekly | monthly
-- =============================================================================

ALTER TABLE tasks
  ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'));

ALTER TABLE reminders
  ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly'));
