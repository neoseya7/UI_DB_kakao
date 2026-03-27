import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { user_id, email, store_name } = payload

        if (!user_id || !email || !store_name) {
            return NextResponse.json({ success: false, error: 'Missing Required Parameters' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // Insert into public.stores securely bypassing RLS
        // Handle case where it might already exist (e.g., retries)
        const { error: dbErr } = await supabaseAdmin.from('stores').upsert({
            id: user_id,
            email: email,
            name: store_name,
            status: 'pending'
        })

        if (dbErr) throw dbErr

        return NextResponse.json({ success: true, message: 'Store record successfully created!' })

    } catch (e: any) {
        console.error("Store Registration Proxy Error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
