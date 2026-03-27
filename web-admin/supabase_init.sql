-- ========================================================
-- Franchise Order Dashboard - Supabase Initialization SQL
-- Phase 2 Database Schema Definition
-- ========================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================
-- TABLE CREATION
-- ==========================

-- 2. `stores` (가맹점 계정 및 상태 관리)
-- supabase auth.users와 동기화되는 기본 메타데이터 테이블입니다.
CREATE TABLE public.stores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), -- 통상적으로 auth.uid()와 일치시킴
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- 3. `store_settings` (매장별 상세 노출 및 환경 설정)
-- 1:1 Relationship with stores
CREATE TABLE public.store_settings (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    kakao_room_name TEXT,
    show_price BOOLEAN DEFAULT true,
    show_stock BOOLEAN DEFAULT true,
    notice_texts JSONB DEFAULT '[]'::jsonb,
    badge_stock_level INTEGER DEFAULT 3,
    crm_tags JSONB DEFAULT '[]'::jsonb,
    order_alert_enabled BOOLEAN DEFAULT true,
    alert_minutes_before INTEGER DEFAULT 5
);
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- 4. `super_admin_config` (최고 관리자 전역 설정)
-- 전역적으로 1개의 로우(id=1)만 갖는 테이블. (API Key & Prompts)
CREATE TABLE public.super_admin_config (
    id SERIAL PRIMARY KEY,
    gemini_api_key TEXT,
    gemini_model TEXT DEFAULT 'gemini-1.5-flash',
    openai_api_key TEXT,
    openai_model TEXT DEFAULT 'gpt-4o-mini',
    prompt_set_1 JSONB DEFAULT '{}'::jsonb,
    prompt_set_2 JSONB DEFAULT '{}'::jsonb
);
ALTER TABLE public.super_admin_config ENABLE ROW LEVEL SECURITY;

-- 5. `products` (상품/메뉴 관리)
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    target_date DATE, -- NULL이면 is_regular_sale=true
    is_regular_sale BOOLEAN DEFAULT false,
    collect_name TEXT NOT NULL, -- 카톡/챗봇 치환용 필수 상품명
    display_name TEXT,          -- 고객 노출용 상품명
    price INTEGER DEFAULT 0,
    allocated_stock INTEGER DEFAULT 0,
    deadline_date DATE,
    deadline_time TIME,
    image_urls JSONB DEFAULT '[]'::jsonb,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 6. `orders` (고객 주문 통합 헤더 - 날짜/고객별 1로우)
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    pickup_date DATE NOT NULL,
    customer_nickname TEXT NOT NULL,
    is_received BOOLEAN DEFAULT false,
    customer_memo_1 TEXT,
    customer_memo_2 TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
-- 인덱스 추가 (조회 속도 최적화)
CREATE INDEX idx_orders_pickup_date ON public.orders(pickup_date);
CREATE INDEX idx_orders_customer ON public.orders(customer_nickname);

-- 7. `order_items` (단일 주문 내의 상품별 배열)
CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 8. `chat_logs` (오늘의 주문 / 데이터 파이프라인 중간 덤프)
CREATE TABLE public.chat_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    collect_date DATE NOT NULL,
    chat_time TIME NOT NULL,
    nickname TEXT NOT NULL,
    chat_content TEXT NOT NULL,
    category TEXT CHECK (category IN ('ORDER', 'INQUIRY', 'COMPLAINT', 'TEST', 'UNKNOWN')),
    product_name TEXT,
    quantity INTEGER,
    classification TEXT,
    is_processed BOOLEAN DEFAULT false, -- 처리되어 orders 테이블로 이관되었는지 확인
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;


-- ==========================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================
-- 현재 로그인된 가맹점 계정(auth.uid())이 자신의 데이터만 볼 수 있도록 보호하는 필수 로직입니다.

-- [1] stores: 본인 계정 정보만 열람 가능 (최고 관리자는 별도 Role 적용 필요)
CREATE POLICY "Stores view own data" ON public.stores
    FOR SELECT USING (auth.uid() = id);

-- [2] store_settings: 본인 매장 상세설정 CRUD
CREATE POLICY "Store settings full access" ON public.store_settings
    FOR ALL USING (auth.uid() = store_id);

-- [3] products: 본인 매장에 등록한 상품만 조회 및 수정
CREATE POLICY "Products full access" ON public.products
    FOR ALL USING (auth.uid() = store_id);

-- [4] orders: 본인 매장의 고객 리스트만 조회
CREATE POLICY "Orders full access" ON public.orders
    FOR ALL USING (auth.uid() = store_id);

-- [5] order_items: 주문자의 store_id가 본인 것일 때만 하위 아이템 조회 가능
CREATE POLICY "Order items full access" ON public.order_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE orders.id = order_items.order_id 
            AND orders.store_id = auth.uid()
        )
    );

-- [6] chat_logs: 본인 매장의 카톡 로그만 조회
CREATE POLICY "Chat logs full access" ON public.chat_logs
    FOR ALL USING (auth.uid() = store_id);

-- [7] super_admin_config: 일반 매장은 열람 불가. 이후 Role-based 접근 통제 필요.
-- (TODO: DB 어드민이나 Service_key 통신시에만 접근하는 것으로 제한)
