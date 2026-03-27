import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
    try {
        const { store_id, kakao_room_name } = await request.json()

        if (!store_id) {
            return NextResponse.json({ success: false, error: 'Missing store_id' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            return NextResponse.json({ success: false, error: 'Server misconfiguration: Service Role Key missing' }, { status: 500 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

        // Use service_role key to bypass Row-Level Security
        const supabase = createClient(supabaseUrl, serviceKey)

        const { error } = await supabase.from('store_settings').upsert(
            { store_id, kakao_room_name },
            { onConflict: 'store_id' }
        )

        if (error) throw new Error(error.message)

        return NextResponse.json({ success: true, message: 'Saved successfully' })
    } catch (e: any) {
        console.error("API update-room error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
