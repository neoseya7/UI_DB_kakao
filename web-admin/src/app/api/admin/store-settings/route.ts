import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            return NextResponse.json({ success: false, error: 'Server misconfiguration: Service Role Key missing' }, { status: 500 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

        // Use service_role key to bypass Row-Level Security
        const supabase = createClient(supabaseUrl, serviceKey)

        const { data, error } = await supabase.from('store_settings').select('store_id, kakao_room_name')

        if (error) throw error

        return NextResponse.json({ success: true, data })
    } catch (e: any) {
        console.error("API store-settings error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
