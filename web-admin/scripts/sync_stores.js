const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
    console.log("Fetching users from auth...")
    const { data: { users }, error } = await supa.auth.admin.listUsers()
    if (error) return console.error(error)

    const relevantUsers = users.filter(u => u.user_metadata?.role === 'store_pending' || u.user_metadata?.role === 'store_owner')

    console.log(`Found ${relevantUsers.length} relevant auth users. Syncing to public.stores...`)

    let count = 0;
    for (const u of relevantUsers) {
        const { error: insertErr } = await supa.from('stores').upsert({
            id: u.id,
            email: u.email,
            name: u.user_metadata.name || 'Unknown Store',
            status: u.user_metadata.role === 'store_owner' ? 'active' : 'pending'
        })
        if (insertErr) {
            console.error(`Error inserting ${u.email}:`, insertErr)
        } else {
            console.log(`Successfully synced ${u.email} to public.stores`)
            count++;
        }
    }
    console.log(`Done. Synced ${count} users.`)
}
run()
