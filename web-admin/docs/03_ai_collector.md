# 🤖 03. AI Collector & Parsing Logic

본 문서는 카카오톡 대화방에서 유입된 텍스트를 AI 모델(Gemini)을 활용해 정형화된 데이터로 추출하는 파이프라인 명세입니다.

## 1. 파일 위치
수집 데이터가 인입되는 엔드포인트:
*   `src/app/api/collect/route.ts` (단건)
*   `src/app/api/collect-bulk/route.ts` (대량/일괄)

## 2. 핵심 로직 단계 (Parsing Stages)

### 2.1. 1단계: 정규표현식 보정 (Preprocessing)
AI 모델의 파싱 오류를 줄이기 위해 원문 텍스트의 요일을 제거하거나 픽업 날짜 패턴을 전처리합니다.

### 2.2. 2단계: AI 모델 인퍼런스 (LLM Inference)
Google Gemini API (gemini-2.5-flash) 또는 OpenAI GPT 모델을 호출합니다. 시스템 프롬프트를 통해 카카오톡 대화를 다음 4가지 요소로 분해하도록 지시합니다:
1.  **Category**: `ORDER`(주문), `COMPLAINT`(취소), `INQUIRY`(문의), `픽업고지` 등
2.  **Date**: `MM/DD` 포맷 (없을 시 `미지정`)
3.  **Product**: 띄어쓰기를 무시하고 원형 명칭에 가장 가깝게 추출
4.  **Quantity**: 아라비아 숫자 (예: `1`, `2`)

### 2.3. 3단계: 다중 품목 정돈 (Splitting)
고객이 *"초코케이크 1개, 딸기마카롱 2개 12/25일 주문요"* 라고 말한 경우, AI는 다수의 제품을 배열로 응답합니다.
*   **분할 규칙:** 응답받은 파싱 배열의 길이만큼 Loop를 돌리며 `chat_logs` 테이블 행(Row)을 **각각 독립적으로 생성**합니다. (이때 각 로그마다 별개의 ID와 product_name을 가집니다)

### 2.4. 4단계: 비 주문성 메시지 찌꺼기 제거 플로우 (Ghost Order Prevention)
단순 문의나 픽업 고지 같은 비주문형 메시지에서 AI가 환각(Hallucination)으로 `상품명`을 끼워 맞추는 증상을 방지하기 위해 강제 클리어 로직이 적용되어 있습니다.
*   `category` 가 **"픽업고지", "상품후기", "기타", "문의"** 등의 문자열을 포함할 경우:
    *   배열 `extractedItems` 를 강제로 비워버림(`[]`).
    *   따라서 주문 매칭 시도가 원천 차단되며, `product_name` 을 `X`로 저장하여 프론트엔드 UI에 군더더기 상태배지가 뜨지 않도록 깔끔하게 종결함.

### 2.5. 5단계: 상품 DB 매칭 (Product Matching)
`category` 가 `ORDER` 인 경우, DB의 `products` 테이블 내 `collect_name`과 AI가 색인한 이름을 비교합니다.
*   매칭 성공: `orders` 와 `order_items` 행 추가. (정식 주문)
*   매칭 실패: 주문(orders) 컬럼 생성 스킵. `chat_logs` 에만 저장되며 `[상품미등록]` 상태가 됩니다.
