require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
    const { data } = await supabase.from('products')
        .select('collect_name')
        .eq('store_id', '11d603af-ab54-4c2e-9043-319cccdd6b7a')
        .like('collect_name', '%감바스%항정살%');
    console.log("Combo Products:", data);
})();
