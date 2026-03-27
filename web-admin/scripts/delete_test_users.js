const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
    const { data: { users }, error } = await supa.auth.admin.listUsers()
    if (error) return console.error(error)

    for (const u of users) {
        if (u.email === 'neoseya@naver.com' || u.email === 'test@test.com') {
            const { error: delErr } = await supa.auth.admin.deleteUser(u.id)
            if (!delErr) {
                console.log(`Deleted test user: ${u.email}`)
            } else {
                console.error(`Failed to delete ${u.email}:`, delErr)
            }
        }
    }
}
run()
