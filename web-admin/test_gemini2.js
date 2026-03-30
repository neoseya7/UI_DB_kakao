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
- 'user_product_name'과 가장 유사한 상품을 하나 찾아 정확한 상품명으로 반환해 주세요.
- 없다면 'user_product_name' 그대로 반환. 출력은 상품명 하나만.
#INPUT#
- product_list: [${products.join(', ')}]
#OUTPUT#
`;
        
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const {data: config} = await supabase.from('super_admin_config').select('gemini_api_key').single();
        const geminiKey = config.gemini_api_key;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: prompt }] },
                contents: [{ parts: [{ text: 'user_product_name: "칼국수"' }] }]
            })
        });
        const result = await res.json();
        console.log(JSON.stringify(result, null, 2));

        const res2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: prompt }] },
                contents: [{ parts: [{ text: 'user_product_name: "백김치"' }] }]
            })
        });
        const result2 = await res2.json();
        console.log(JSON.stringify(result2, null, 2));

    } catch(e) {
        console.error(e);
    }
}
run();
