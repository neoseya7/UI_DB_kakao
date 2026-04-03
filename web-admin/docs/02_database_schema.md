# 🗄️ 02. Database Schema

본 문서는 Supabase(PostgreSQL)의 릴레이션 스키마와 테이블 명세서입니다.

## 1. 핵심 철학 (Design Rules)
*   **분리 원칙:** 과거의 단일 테이블 구조를 버리고 정규화 수행.
*   **1주문서 1품목 (1:1 강제):** 시스템 아키텍처 상 '1개의 주문서'는 무조건 '1개의 주문품목'만 가지도록 코딩 레벨에서 강제됩니다. 다수의 상품을 하나의 카톡으로 주문해도 각 상품마다 N개의 독립된 주문서 Row가 생성됩니다.

## 2. 테이블 목록

### 2.1. `users` 테이블 (프로필 정보)
Supabase 기본 `auth.users`와 연동되는 가맹점 프로필 테이블.
*   `id` (uuid, PK): Supabase Auth ID 매핑
*   `store_name` (text): 매장 상호명
*   `store_address` (text): 매장 주소
*   `phone` (text): 매장 연락처
*   `status` (text): 승인 여부 상태값

### 2.2. `products` 테이블 (상품/재고 정보)
매장별 상품 카탈로그 및 수량 정보.
*   `id` (uuid, PK)
*   `store_id` (uuid, FK): 소속 매장 ID
*   `target_date` (date): 판매 지정 날짜 (상시판매의 경우 NULL)
*   `collect_name` (text): AI가 파싱하고 식별하는 원본 상품명(수집명)
*   `display_name` (text): 고객 노출용 상품명
*   `price` (int): 기준 단가
*   `allocated_stock` (int): 당일 발주/확보 수량
*   `is_hidden` (boolean): 논리적 삭제(Soft Delete) 플래그 여부

### 2.3. `orders` 테이블 (주문서 팝업 단위)
주문자의 기본 정보와 픽업 날짜 보유.
*   `id` (uuid, PK)
*   `store_id` (uuid, FK)
*   `pickup_date` (date): 픽업일
*   `customer_nickname` (text): 카톡 상의 고객 닉네임 (식별자 역할)
*   `is_received` (boolean): 수령 완료 여부 플래그
*   `customer_memo_1` (text): 수동 처리 또는 봇 메모

### 2.4. `order_items` 테이블 (주문 품목)
한 주문서에 연결되는 상품 수량. (시스템 강제 규칙에 의해 1:1 관계 유지)
*   `id` (uuid, PK)
*   `order_id` (uuid, FK): `orders.id`
*   `product_id` (uuid, FK): `products.id`
*   `quantity` (int): 고객이 주문한 수량

### 2.5. `chat_logs` 테이블 (카톡 원문 보관소)
수집된 대화를 분석 결과와 함께 저장. UI의 "오늘의 대화" 출처.
*   `id` (uuid, PK)
*   `store_id` (uuid, FK)
*   `chat_content` (text): 원본 대화 텍스트
*   `customer_nickname` (text): 발송자 닉네임
*   `product_name` (text): AI가 분리해낸 품목 이름
*   `category` (text): `ORDER` | `COMPLAINT` | `INQUIRY`
*   `classification` (text): `[픽업고지]`, `[상품미등록]` 등의 프론트엔드 라벨링 텍스트
*   `is_processed` (boolean): 정식 order로 동기화 완료되었는지 여부
