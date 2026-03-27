import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { id } = payload

        if (!id) {
            return NextResponse.json({ success: false, error: 'Missing order ID' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            return NextResponse.json({ success: false, error: 'Service Role Key missing' }, { status: 500 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabase = createClient(supabaseUrl, serviceKey)

        // Explicitly delete order items first to avoid any Foreign Key constraint issues
        await supabase.from('order_items').delete().eq('order_id', id)

        // Perform rigorous deletion on the orders table
        const { error, data } = await supabase.from('orders').delete().eq('id', id).select()

        if (error) {
            throw new Error(error.message)
        }
        
        if (!data || data.length === 0) {
            return NextResponse.json({ success: false, error: 'DB에서 해당 주문을 찾을 수 없거나 이미 삭제되었습니다.' }, { status: 404 })
        }

        return NextResponse.json({ success: true, message: 'Order cleanly deleted from database' })
    } catch (e: any) {
        console.error("API delete route error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
