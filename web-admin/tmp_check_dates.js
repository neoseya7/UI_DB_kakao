require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const store_id = '70b20188-e039-450d-b8df-73d3b509ef66';
    
    const { data: products, error } = await supabase.from('products').select('*').eq('store_id', store_id);
    
    console.log("All Target Dates in DB for store " + store_id + ":");
    const dates = new Set();
    products?.forEach(p => {
        if (p.target_date) dates.add(`${p.target_date} (hidden: ${p.is_hidden})`);
    });
    console.log(Array.from(dates));
})();
