import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabase = createClient(supabaseUrl, serviceKey)

        // Fetch active stores and their kakao_room_name
        const { data: stores, error } = await supabase
            .from('stores')
            .select(`
                id,
                name,
                store_settings ( kakao_room_name )
            `)
            .eq('status', 'active')

        if (error) throw error

        const { data: config } = await supabase.from('super_admin_config').select('*').eq('id', 1).single()

        // Format for Python scraper
        const storeList = stores?.map(store => {
            const settings = Array.isArray(store.store_settings) ? store.store_settings[0] : store.store_settings
            const roomName = settings?.kakao_room_name || ""

            return {
                room_name: roomName,
                store_id: store.id,
                store_name: store.name
            }
        }).filter(s => s.room_name) // Only return stores that have a room name configured

        return NextResponse.json({
            success: true,
            store_list: storeList,
            super_admin_config: {
                gemini_api_key: config?.gemini_api_key,
                openai_api_key: config?.openai_api_key
            }
        })
    } catch (e: any) {
        console.error("API scraper config error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
