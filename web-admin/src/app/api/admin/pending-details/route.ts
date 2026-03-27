import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { store_ids } = payload

        if (!store_ids || !Array.isArray(store_ids)) {
            return NextResponse.json({ success: false, error: 'Malformed store_ids array' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
        if (error) throw error

        // Map store IDs to their metadata
        const metadataMap: Record<string, any> = {}
        users.forEach(u => {
            if (store_ids.includes(u.id)) {
                metadataMap[u.id] = u.user_metadata || {}
            }
        })

        return NextResponse.json({ success: true, metadata: metadataMap })

    } catch (e: any) {
        console.error("Pending Details Fetch Error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
