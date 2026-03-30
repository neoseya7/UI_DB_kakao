const fs = require('fs');
require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');

async function run() {
    try {
        const productsRaw = fs.readFileSync('tmp_products.txt', 'utf8').split('\n');
        const products = productsRaw.map(l => l.split(' | ')[0]).filter(Boolean);
        
        const prompt = `
#CONTEXT#
- 'user_product_name'은 사용자가 입력한 상품명입니다.
- 'product_list'는 시스템에 등록된 실제 상품 목록입니다.
- 'user_product_name'과 **글자(단어) 구성이 가장 일치하는 상품**을 'product_list'에서 하나만 찾아 정확한 상품명으로 반환해 주세요.
- **의미나 카테고리가 비슷하다고 매칭하지 말고, 오직 '글자'의 일치도만 보고 판단하세요.**
- **매우 중요: 만약 글자가 일치하는 상품이 없다면, 반드시 'user_product_name'을 그대로 반환해 주세요.** (억지로 매칭 금지)
- **[출력 규칙]**: 생각하는 과정(1단계~3단계)이나 설명을 절대 출력하지 마십시오. **오직 최종 상품명 문자열 하나만** 출력하세요.

#매칭 규칙 (Strict Matching Rules)#
1. **글자 기반 매칭 (Character Overlap Only)**:
   - 입력값과 목록 간에 **공통된 2글자 이상**이 연속으로 겹치는 경우에만 매칭하십시오.
   - 의미가 비슷해도(예: 비슷한 부위, 카테고리) **글자가 겹치지 않으면 절대 매칭하지 마십시오.**

2. **매칭 실패 시 처리**:
   - 겹치는 글자가 없거나, 불확실하면 **반드시 입력값(\`user_product_name\`)을 그대로 반환**하십시오.
   - 억지로 가장 비슷한 것을 찾지 마십시오.

3. **검증 (Verification) - 절대 위반 금지**:
   - **용량/단위 불일치**: "4L"와 "500ml", "1kg"와 "500g" 처럼 **숫자나 단위**가 확연히 다르면 **절대 매칭하지 마십시오.** (핵심 단어가 같아도 금지)

#매칭 허용 규칙 (Priority)#
**0. [최우선] 완벽 일치**: 글자가 100% 똑같으면 무조건 선택.
**1. 줄임말 및 조합형 (조건부 허용)**: 
   - **(최우선) 부분 포함(Substring)**: 입력된 단어가 상품명에 **완벽하게 포함**되어 있다면, 다른 글자가 붙어 있어도(수식어 등) 무조건 1순위로 매칭하세요.

#INPUT#
- product_list: [${products.join(', ')}]
#OUTPUT FORMAT#
- **Final Product Name Only** (No explanation, No markdown)
`;
        
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const {data: config} = await supabase.from('super_admin_config').select('gemini_api_key').single();
        const geminiKey = config.gemini_api_key;

        console.log("== TEMPERATURE 1.0 (DEFAULT) ==");
        for (let i = 0; i < 5; i++) {
            const userPrompt = `user_product_name: "고등어"`;
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: prompt }] },
                    contents: [{ parts: [{ text: userPrompt }] }]
                })
            });
            const result = await res.json();
            console.log(`TEST ${i+1}: `, result.candidates[0].content.parts[0].text.trim());
        }

    } catch(e) {
        console.error(e);
    }
}
run();
