-- Thêm auto_shuffle và show_answers_immediately vào quiz table
-- Chạy: wrangler d1 execute lmsictu --file=migrations/0002_quiz_shuffle_feedback.sql

ALTER TABLE quiz ADD COLUMN auto_shuffle INTEGER NOT NULL DEFAULT 1;
ALTER TABLE quiz ADD COLUMN show_answers_immediately INTEGER NOT NULL DEFAULT 0;
