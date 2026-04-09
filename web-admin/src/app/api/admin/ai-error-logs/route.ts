import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function GET() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
        return NextResponse.json({ success: false, error: "Server misconfiguration" }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
        .from('ai_error_logs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(100)

    if (error) {
        return NextResponse.json({ success: true, logs: [] })
    }

    return NextResponse.json({ success: true, logs: data || [] })
}
