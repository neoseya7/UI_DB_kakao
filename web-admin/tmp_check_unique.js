require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // Try to insert a duplicate name but different date to test DB constraints
    const store_id = '905bd030-bb28-4888-886a-5f39746ce049';
    
    // First insert
    const { data: p1, error: e1 } = await supabase.from('products').insert({
        store_id,
        target_date: '2050-01-01',
        is_regular_sale: false,
        collect_name: 'TEST_POTATO',
        price: 1000
    }).select().single();
    
    console.log("Insert 1 error:", e1?.message);
    
    // Second insert (same name, different date)
    const { data: p2, error: e2 } = await supabase.from('products').insert({
        store_id,
        target_date: '2050-01-02',
        is_regular_sale: false,
        collect_name: 'TEST_POTATO',
        price: 1000
    }).select().single();
    
    console.log("Insert 2 error (Different Date):", e2?.message);
    
    // Cleanup
    if (p1) await supabase.from('products').delete().eq('id', p1.id);
    if (p2) await supabase.from('products').delete().eq('id', p2.id);
})();
