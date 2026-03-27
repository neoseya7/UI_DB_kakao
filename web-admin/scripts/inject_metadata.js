const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
    const { data: { users }, error } = await supa.auth.admin.listUsers()
    if (error) return console.error(error)

    for (const u of users) {
        // Skip if already has owner_name
        if (u.user_metadata?.owner_name) continue;

        const updatedMeta = {
            ...u.user_metadata,
            owner_name: '테스트 점주',
            phone: '010-9999-8888',
            biz_number: '123-45-67890',
            biz_address: '서울 강남구 테헤란로 123 테스트빌딩 1층',
            biz_type: '도소매',
            biz_category: '식음료'
        }

        const { error: updateErr } = await supa.auth.admin.updateUserById(u.id, {
            user_metadata: updatedMeta
        })

        if (!updateErr) {
            console.log(`Injected test business metadata for ${u.email}`)
        } else {
            console.error(updateErr)
        }
    }
}
run()
