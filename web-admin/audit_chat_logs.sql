-- chat_logs 감사 로그: classification이 null로 되돌아가거나 is_processed가 false로 되돌아가는 경우를 기록
-- Supabase SQL Editor에서 1회 실행.
-- 분석 쿼리: SELECT * FROM chat_logs_audit ORDER BY changed_at DESC LIMIT 100;

CREATE TABLE IF NOT EXISTS chat_logs_audit (
  audit_id          bigserial PRIMARY KEY,
  changed_at        timestamptz NOT NULL DEFAULT now(),
  operation         text NOT NULL,
  row_id            uuid,
  store_id          uuid,
  nickname          text,
  chat_content      text,
  old_classification text,
  new_classification text,
  old_product_name  text,
  new_product_name  text,
  old_category      text,
  new_category      text,
  old_is_processed  boolean,
  new_is_processed  boolean,
  db_user           text,
  app_name          text,
  client_addr       inet,
  client_port       int,
  backend_pid       int,
  top_xact_query    text
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_audit_changed_at ON chat_logs_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_audit_row_id ON chat_logs_audit(row_id);

CREATE OR REPLACE FUNCTION fn_chat_logs_audit() RETURNS trigger AS $$
BEGIN
  -- 관심 케이스만 기록:
  --  (1) classification이 non-null -> null
  --  (2) is_processed가 true -> false
  --  (3) product_name이 실제값 -> null/X (취소 흐름 확인용)
  IF (TG_OP = 'UPDATE') AND (
       (OLD.classification IS NOT NULL AND NEW.classification IS NULL)
    OR (OLD.is_processed = true AND NEW.is_processed = false)
    OR (OLD.product_name IS NOT NULL AND OLD.product_name <> 'X'
        AND (NEW.product_name IS NULL OR NEW.product_name = 'X'))
  ) THEN
    INSERT INTO chat_logs_audit(
      operation, row_id, store_id, nickname, chat_content,
      old_classification, new_classification,
      old_product_name, new_product_name,
      old_category, new_category,
      old_is_processed, new_is_processed,
      db_user, app_name, client_addr, client_port, backend_pid,
      top_xact_query
    ) VALUES (
      TG_OP, OLD.id, OLD.store_id, OLD.nickname, OLD.chat_content,
      OLD.classification, NEW.classification,
      OLD.product_name, NEW.product_name,
      OLD.category, NEW.category,
      OLD.is_processed, NEW.is_processed,
      current_user,
      current_setting('application_name', true),
      inet_client_addr(),
      inet_client_port(),
      pg_backend_pid(),
      left(current_query(), 500)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chat_logs_audit ON chat_logs;
CREATE TRIGGER trg_chat_logs_audit
  AFTER UPDATE ON chat_logs
  FOR EACH ROW
  EXECUTE FUNCTION fn_chat_logs_audit();

-- 제거 시:
-- DROP TRIGGER IF EXISTS trg_chat_logs_audit ON chat_logs;
-- DROP FUNCTION IF EXISTS fn_chat_logs_audit();
-- DROP TABLE IF EXISTS chat_logs_audit;
