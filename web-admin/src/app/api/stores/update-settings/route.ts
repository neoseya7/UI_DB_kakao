import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
    try {
        const { store_id, payload } = await request.json()

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabase = createClient(supabaseUrl, serviceKey)

        // 1. Ensure the store_id exists in public.stores (crucial for Super Admins testing this page)
        const { data: storeCheck } = await supabase.from('stores').select('id').eq('id', store_id).single()

        if (!storeCheck) {
            // Provision dummy store for Super Admin testing
            await supabase.from('stores').insert({
                id: store_id,
                email: 'admin_test_' + store_id.substring(0, 6) + '@admin.com',
                name: 'Master Admin Test Store',
                status: 'active'
            })
        }

        // 2. Upsert store_settings
        const { error } = await supabase.from('store_settings').upsert({ store_id, ...payload })
        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (e: any) {
        console.error("API update-settings error:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
