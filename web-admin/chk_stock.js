require('dotenv').config({path:'.env.local'});
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data } = await supabase.from('chat_logs').select('id, chat_content, classification, created_at, category').order('created_at', {ascending: false}).limit(500);
    const outOfStock = data.filter(x => x.classification && x.classification.includes('재고초과'));
    fs.writeFileSync('tmp_stock.json', JSON.stringify({ count: outOfStock.length, logs: outOfStock }, null, 2));
}

run();
