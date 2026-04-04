require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // We can fetch table column defaults via postgres meta if possible.
    // Or just insert a dummy order and see what is_hidden defaults to.
    const store_id = '905bd030-bb28-4888-886a-5f39746ce049';
    const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
        store_id,
        pickup_date: '1999-01-01',
        customer_nickname: 'TEST_DEFAULT',
        is_received: false,
    }).select().single()
    
    console.log("Inserted dummy order:", newOrder);
    
    // cleanup
    if (newOrder) {
      await supabase.from('orders').delete().eq('id', newOrder.id);
    }
})();
