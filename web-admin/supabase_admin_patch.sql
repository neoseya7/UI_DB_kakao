-- ========================================================
-- 최고 관리자 권한 및 회원가입 자동 동기화 기능 패치 (Phase 2-1)
-- ========================================================

-- 1. 회원가입 시 auth.users(회원) 정보를 public.stores(가맹점 테이블)로 자동 복사하는 트리거
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stores (id, email, name, status)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'name', 'pending');
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. 최고 관리자 계정에 대한 전역 RLS 접근 권한 통과(Bypass) 추가
-- (단순 관리를 위해 id 또는 email 주소에 'admin@'이 포함된 계정을 관리자 취급합니다)
CREATE POLICY "Admin full access to stores" 
  ON public.stores FOR ALL USING (auth.jwt() ->> 'email' LIKE 'admin@%');

CREATE POLICY "Admin full access to super_admin_config" 
  ON public.super_admin_config FOR ALL USING (auth.jwt() ->> 'email' LIKE 'admin@%');

-- 3. 초기 슈퍼 어드민 Config 기본 단일(Row) 생성
INSERT INTO public.super_admin_config (id, gemini_model, openai_model) 
VALUES (1, 'gemini-1.5-flash', 'gpt-4o-mini') 
ON CONFLICT (id) DO NOTHING;
