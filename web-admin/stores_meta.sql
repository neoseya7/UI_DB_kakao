-- 브랜드-매장 매핑 테이블
-- 목적: /api/products/shared에서 auth.admin.listUsers() 호출을 제거하고
--       빠른 인덱스 조회로 대체하기 위함.
-- Supabase SQL Editor에서 1회 실행.

CREATE TABLE IF NOT EXISTS public.stores_meta (
  store_id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stores_meta_brand ON public.stores_meta(brand_name);

-- auth.users 변경 시 자동 동기화 트리거
CREATE OR REPLACE FUNCTION public.sync_stores_meta() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.stores_meta(store_id, brand_name, updated_at)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'brand_name', now())
  ON CONFLICT (store_id) DO UPDATE
    SET brand_name = EXCLUDED.brand_name,
        updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_stores_meta ON auth.users;
CREATE TRIGGER trg_sync_stores_meta
  AFTER INSERT OR UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_stores_meta();

-- 기존 사용자 백필
INSERT INTO public.stores_meta(store_id, brand_name, updated_at)
SELECT id, raw_user_meta_data->>'brand_name', now()
FROM auth.users
ON CONFLICT (store_id) DO UPDATE
  SET brand_name = EXCLUDED.brand_name,
      updated_at = now();

-- RLS: service_role만 접근 (클라이언트 직접 접근 금지)
ALTER TABLE public.stores_meta ENABLE ROW LEVEL SECURITY;
-- service_role은 RLS를 우회하므로 별도 정책 없이도 API에서 접근 가능

-- 확인
SELECT brand_name, COUNT(*) AS store_count
FROM public.stores_meta
GROUP BY brand_name
ORDER BY store_count DESC;
