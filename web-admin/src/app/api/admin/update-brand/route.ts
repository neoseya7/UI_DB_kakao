import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { store_id, brand_name } = payload

        if (!store_id || brand_name === undefined) {
            return NextResponse.json({ success: false, error: 'Missing Required Parameters' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // 1. Fetch current metadata
        const { data: userObj, error: fetchErr } = await supabaseAdmin.auth.admin.getUserById(store_id)
        if (fetchErr) throw fetchErr

        const currentMeta = userObj.user.user_metadata || {}

        // 2. Inject or update official brand_name into metadata
        const updatedMeta = {
            ...currentMeta,
            brand_name: brand_name
        }

        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(store_id, {
            user_metadata: updatedMeta
        })
        if (authErr) throw authErr

        return NextResponse.json({ success: true, message: 'Brand successfully updated!' })

    } catch (e: any) {
        console.error("Brand Update Error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
