-- chat_logs 재분류 Cron을 위한 스키마 추가
-- AI 분류 실패(classification=null) 건에 대한 재시도 횟수 추적

ALTER TABLE public.chat_logs
    ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0 NOT NULL;

-- 재분류 대상 조회 최적화 (부분 인덱스)
CREATE INDEX IF NOT EXISTS idx_chat_logs_null_class
    ON public.chat_logs (created_at DESC)
    WHERE classification IS NULL AND category = 'UNKNOWN';
