import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabase = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        const { data: config, error } = await supabase.from('super_admin_config').select('allowed_brands').eq('id', 1).single()
        if (error) throw error

        let brands: string[] = []
        if (config && config.allowed_brands) {
            brands = Array.isArray(config.allowed_brands) ? config.allowed_brands : JSON.parse(config.allowed_brands)
        }

        return NextResponse.json({ success: true, brands })

    } catch (e: any) {
        console.error("Brands Fetch API Error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
