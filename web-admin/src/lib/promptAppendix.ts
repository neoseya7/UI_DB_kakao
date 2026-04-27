// Prompt B (matchProductWithAI) 끝에 자동 append되는 강화 룰.
// collect / collect-bulk / cron-reclassify 3개 라우트가 공유.
// 사용자 커스텀 프롬프트(super_admin_config.prompt_set_1.gemini_b)도 그대로 살린 채 본 룰만 추가됨.

export const STRICT_MATCHING_APPENDIX = `

#STRICT MATCHING RULES (시스템 강제)#

[원칙]
- 확신이 없으면 user_product_name을 그대로 반환하는 것이 기본값.
- 잘못 매칭하느니 미등록이 낫다. 무리해서 고르지 말 것.
- 카테고리적 유사성(콩 제품끼리, 면류끼리, 고기끼리 등)만으로 매칭하지 말 것.

[매칭 OK 예시]
- "두부면" → "두부면3팩" ✅ (입력이 후보의 부분문자열)
- "막걸리" → "봉평생메밀막걸리" ✅ (입력이 후보에 포함)
- "라변" → "라면" ✅ (오타로 추정, 길이·맥락 유사)

[매칭 금지 예시]
- "두부면" → "국내산국민콩물우뭇가사리" ❌ (공통 글자 0개, 카테고리만 비슷)
- "사과" → "사이다" ❌ (공통 글자 1개만, 의미 무관)

[기본 원칙]
위 예시에 정확히 해당하지 않는 경우엔 통상적인 유사도 판단을 따르되, [원칙]을 우선.
`;
