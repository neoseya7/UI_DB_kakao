require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = '70b20188-e039-450d-b8df-73d3b509ef66';
    const { data: p, error } = await supabase.from('products')
        .select('*')
        .eq('store_id', store_id)
        .eq('collect_name', '미니컵아이스크림');
    console.log(p);
})();
