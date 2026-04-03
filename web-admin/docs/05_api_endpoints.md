# 📡 05. API Endpoints & Webhooks

본 문서는 `UI_DB_kakao` 프로젝트와 외부(Google Apps Script, Android Parser) 간의 데이터 연동을 담당하는 API 명세입니다.

모든 경로는 기본 URL(예: `https://your-domain.vercel.app`)의 하위로 구성됩니다.

## 1. 카카오톡 대화 수집 통로 (Data Intake)

### 1.1. 단건 수집 포트
*   **Endpoint:** `POST /api/collect`
*   **Description:** 송신된 채팅 전문 1개를 OpenAI/Gemini로 즉시 파싱하고 DB에 동기화.
*   **Body:** `{ chat_content: string, room: string, sender: string }`
*   **Response:** `chat_logs`, `orders` DB 삽입 결과 리턴.

### 1.2. 일괄 대량 수집 포트
*   **Endpoint:** `POST /api/collect-bulk`
*   **Description:** 백그라운드 파서가 누적한 다수의 채팅 배열을 일관 병렬 처리.

## 2. 외부 알람 Webhook (GAS 연동용)

기존 레거시 프랜차이즈 관리 방식의 통합을 위해 구글 앱스 스크립트(GAS)와 정보를 주고받기 위한 접점입니다.

### 2.1. 재고/마감 알림 (Stock Status Alert)
*   **Endpoint:** `GET /api/orders/webhook`
*   **Description:** GAS에서 일정 주기로 찌르며 재고 부족 상태나 새로 누적된 일일 현황을 가져갑니다.
*   **Query Params:** `store_id` (옵션으로 지원 가능성 설계)

## 3. 인증/보안 계층
대부분 엔드포인트는 Supabase 클라이언트 SDK 단에서 `RLS (Row Level Security)`를 거치게 되며, 외부에서 무단으로 API를 마구잡이 호출하는 것을 방지하기 위해 기본 Bearer Token 혹은 내부 Secret Key 검증을 활용할 예정입니다.
