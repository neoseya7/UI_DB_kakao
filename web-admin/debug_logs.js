require('dotenv').config({path: '.env.local'});
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { data, error } = await supabase.from('chat_logs')
        .select('*')
        .eq('store_id', '9018fcb3-897d-47f2-8396-1f4ddf5701c9')
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) {
        console.log('Error:', error);
    } else {
        const out = data.map(d => ({id: d.id, date: d.created_at, name: d.product_name, qty: d.quantity, text: d.chat_content}));
        fs.writeFileSync('debug_logs.json', JSON.stringify(out, null, 2));
        console.log("Saved to debug_logs.json");
    }
})();
