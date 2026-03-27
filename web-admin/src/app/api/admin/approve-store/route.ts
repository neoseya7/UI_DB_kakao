import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { store_id, brand_name } = payload

        if (!store_id || !brand_name) {
            return NextResponse.json({ success: false, error: 'Missing Required Parameters' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // 1. Fetch current metadata to avoid overwriting existing fields (like owner_name, phone)
        const { data: userObj, error: fetchErr } = await supabaseAdmin.auth.admin.getUserById(store_id)
        if (fetchErr) throw fetchErr

        const currentMeta = userObj.user.user_metadata || {}

        // 2. Inject official brand_name into metadata and set role to store_owner
        const updatedMeta = {
            ...currentMeta,
            brand_name: brand_name,
            role: 'store_owner'
        }

        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(store_id, {
            user_metadata: updatedMeta
        })
        if (authErr) throw authErr

        // 3. Update 'stores' PostgreSQL Table status to 'active'
        const { error: dbErr } = await supabaseAdmin.from('stores').update({ status: 'active' }).eq('id', store_id)
        if (dbErr) throw dbErr

        return NextResponse.json({ success: true, message: 'Store officially approved and assigned to brand!' })

    } catch (e: any) {
        console.error("Store Approval Error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
