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

        const testMatch = async (keyword) => {
            const userPrompt = `user_product_name: "${keyword}"`;
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: prompt }] },
                    contents: [{ parts: [{ text: userPrompt }] }]
                })
            });
            const result = await res.json();
            const aiText = result.candidates[0].content.parts[0].text.trim();
            console.log(`Original: ${keyword}`);
            console.log(`AI Output: ${aiText}`);

            // Test intersection logic
            let cleanResult = aiText.replace(/['"\n]/g, "").trim();
            if (cleanResult.includes("user_product_name:")) cleanResult = cleanResult.split("user_product_name:")[1].trim();
            if (cleanResult.includes("Input:")) cleanResult = cleanResult.split("Input:")[1].trim();
            
            if (products.includes(cleanResult)) {
                const set1 = new Set(keyword.replace(/\s/g, "").split(''));
                const set2 = new Set(cleanResult.replace(/\s/g, "").split(''));
                const intersection = new Set([...set1].filter(x => set2.has(x)));
                console.log(`Intersection Size: ${intersection.size} -> ${Array.from(intersection).join(',')}`);
                if (intersection.size >= 2) {
                    console.log(`MATCH SUCCESS! Final DB name: ${cleanResult}`);
                } else {
                    console.log(`MATCH FAILED due to Intersection < 2. Falling back to: ${keyword}`);
                }
            } else {
                console.log(`MATCH FAILED: "${cleanResult}" not found in DB products list.`);
            }
            console.log("------------------------");
        };

        await testMatch("칼국수");
        await testMatch("백김치");
        await testMatch("오징어");

    } catch (e) {
        console.error(e);
    }
}
run();
