# 🏗️ 01. System Architecture

본 문서는 `UI_DB_kakao` (프랜차이즈 가맹점 주문 관리 시스템)의 전체 시스템 컴포넌트 아키텍처 명세입니다.

## 1. 개요 (Overview)
기존 Google Apps Script 기반의 스프레드시트 관리 시스템 한계를 극복하기 위해, **Next.js 14 (App Router) + Supabase (PostgreSQL) 기반의 웹 어드민 시스템**으로 전면 마이그레이션된 아키텍처입니다.

## 2. 기술 스택 (Tech Stack)
*   **Frontend:** Next.js 14, React, Tailwind CSS, Lucide Icons, Radix UI (shadcn/ui 구조 활용)
*   **Backend:** Next.js Route Handlers (`app/api/*`)
*   **Database & Auth:** Supabase (PostgreSQL, Supabase Auth)
*   **Realtime:** Supabase WebSocket (Realtime Subscriptions)
*   **AI Parser:** OpenAI GPT / Gemini API (자연어 카카오톡 대문맥 수집)
*   **External Collectors:** Python 기반 안드로이드 카카오톡 파서 (Local) -> `UI_DB_kakao` 시스템으로 데이터 송출.

## 3. 핵심 아키텍처 흐름 (Core Workflow)

### 3.1. 카카오톡 대화 수집 및 AI 분류 파이프라인
1.  **카카오톡 로컬 파서:** 매장 관리자의 휴대폰/태블릿(또는 파이썬 봇)에서 카트 알림톡, 일반 톡의 텍스트가 추출됨.
2.  **API 송신:** 추출된 대화는 `POST /api/collect` (단건) 또는 `POST /api/collect-bulk` (일괄) 엔드포인트로 JSON 형태로 발송.
3.  **AI 로직 처리:** 
    * AI가 대상을 자연어 분석하여 `수집상품명(Collect Name)`, `수량`, `날짜`를 추출합니다.
    * 카테고리를 `ORDER`(주문), `COMPLAINT`(취소), `INQUIRY`(문의), `픽업고지` 등으로 자율 분류합니다.
4.  **데이터 저장:**
    * 1차적으로 모든 로그는 `chat_logs` DB에 저장 (오늘의 대화 표시용).
    * 카테고리가 `ORDER` 이고 정상적인 상품이 매칭되면, `orders` 및 `order_items`에 정식 데이터 등록.

### 3.2. 대시보드 상태 동기화 (Realtime)
1.  클라이언트는 `Supabase Realtime` 채널을 구독합니다. (`products`, `orders`, `chat_logs` 테이블 등)
2.  수집봇 또는 다른 관리자가 데이터를 삽입/삭제할 때, 클라이언트는 WebSocket 알림을 받아 `fetchLogs()` 혹은 `fetchOrders()`를 트리거하여 화면을 능동적으로 갱신합니다.

## 4. 폴더 구조 (Directory Structure)
```
web-admin/
 ├── docs/                   # 프로젝트 명세서 폴더
 ├── src/
 │   ├── app/
 │   │   ├── (auth)/         # 로그인/회원가입/비밀번호찾기 라우트
 │   │   ├── (dashboard)/    # 어드민 메인 대시보드 구조 (GNB, LNB 포함)
 │   │   │   ├── page.tsx    # 오늘의 대화 (Chat Logs) 모니터링 페이지
 │   │   │   ├── orders/     # 주문/재고 현황 관리 매트릭스 페이지
 │   │   │   └── products/   # 상품 관리/등록 페이지
 │   │   ├── api/            # Next.js 백엔드 로직 (수집, 웹훅, 동기화)
 │   │   ├── layout.tsx      # 최상단 글로벌 레이아웃
 │   │   └── page.tsx        # 랜딩 페이지 (Public)
 │   ├── components/         # 분리된 UI 컴포넌트 목록
 │   └── lib/                # 유틸리티 함수 및 Supabase 클라이언트 세팅
 ├── public/                 # 정적 리소스 (오디오, 이미지 등)
 ├── supabase_init.sql       # 데이터베이스 초기 모델링 스키마 파일
 └── package.json            # 의존성 모듈 정의
```
