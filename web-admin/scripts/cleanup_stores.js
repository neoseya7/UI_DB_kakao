const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
    const { error } = await supa.from('stores')
        .delete()
        .in('email', ['neoseya@naver.com', 'test@test.com'])
    
    if (error) {
        console.error("Error deleting ghost stores:", error)
    } else {
        console.log("Successfully deleted ghost records from public.stores")
    }
}
run()
