-- chat_logs 중복 방지: msg_hash + content fallback
-- 1차: 스크래퍼 hash(동일 닉네임 재수집 차단)
-- 2차: (store_id, collect_date, chat_time, chat_content) 닉네임 변경 케이스 차단

ALTER TABLE public.chat_logs
    ADD COLUMN IF NOT EXISTS msg_hash TEXT;

-- 1차 조회용 (매장 격리)
CREATE INDEX IF NOT EXISTS idx_chat_logs_msg_hash
    ON public.chat_logs (store_id, msg_hash)
    WHERE msg_hash IS NOT NULL;

-- 2차 조회용 (content fallback)
-- (store_id, collect_date, chat_time) 3컬럼으로 같은 분 메시지 1~5건으로 좁힘
CREATE INDEX IF NOT EXISTS idx_chat_logs_dedup
    ON public.chat_logs (store_id, collect_date, chat_time);
