const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log("Checking products named 통통김말이");
    const { data: p } = await s.from('products').select('*').eq('store_id', 'b8274cb6-33ee-4856-a660-152d51fdd14c').ilike('collect_name', '%김말이%');
    console.log("PRODUCTS:", p);
    
    console.log("\nChecking chat for 김말이");
    const { data: c } = await s.from('kakao_chats').select('*').eq('store_id', 'b8274cb6-33ee-4856-a660-152d51fdd14c').ilike('raw_text', '%김말이%').limit(5);
    console.log("CHATS (raw_text):", c);
    
    console.log("\nChecking chat where sender is 최선");
    const { data: c2 } = await s.from('kakao_chats').select('*').eq('store_id', 'b8274cb6-33ee-4856-a660-152d51fdd14c').ilike('sender', '%최선%').limit(5);
    console.log("CHATS (sender):", c2);
}
run();
