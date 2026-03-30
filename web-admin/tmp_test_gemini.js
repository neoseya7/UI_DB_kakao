require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: config } = await supabase.from('super_admin_config').select('*').eq('id', 1).single();
    let parsed = typeof config.prompt_set_1 === 'string' ? JSON.parse(config.prompt_set_1) : config.prompt_set_1;
    let promptB = parsed.gemini_b;

    console.log('--- PROMPT B ---');
    console.log(promptB);

    const store_id = 'f075b2f6-5458-41b3-bb02-978b7a1145fc';
    const { data: products } = await supabase.from('products').select('*').eq('store_id', store_id);
    const productListStr = products.map(p => p.collect_name).join(', ');
    console.log('--- PRODUCTS ---');
    console.log(productListStr);

    const systemPromptText = promptB !== 'Output []' ? promptB : 'fallback';
    const systemPrompt = systemPromptText.replace('{product_list}', productListStr);
    const userPrompt = 'user_product_name: "돼지국밥"';
    
    console.log('--- CALLING GEMINI ---');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini_model}:generateContent?key=${config.gemini_api_key}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: userPrompt }] }]
        })
    });
    const json = await res.json();
    console.log('--- GEMINI RAW RESULT ---');
    console.log(json.candidates?.[0]?.content?.parts?.[0]?.text);
}
run();
