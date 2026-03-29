import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { store_id, new_role } = payload

        if (!store_id || !new_role) {
            return NextResponse.json({ success: false, error: 'Missing Required Parameters' }, { status: 400 })
        }

        const validRoles = ['store_owner', 'brand_admin']
        if (!validRoles.includes(new_role)) {
            return NextResponse.json({ success: false, error: 'Invalid role provided' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) return NextResponse.json({ success: false, error: 'Server misconfiguration' }, { status: 500 })

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        const { data: userObj, error: fetchErr } = await supabaseAdmin.auth.admin.getUserById(store_id)
        if (fetchErr) throw fetchErr

        const currentMeta = userObj.user.user_metadata || {}

        const updatedMeta = {
            ...currentMeta,
            role: new_role
        }

        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(store_id, {
            user_metadata: updatedMeta
        })
        if (authErr) throw authErr

        return NextResponse.json({ success: true, message: '인증 직급이 성공적으로 업데이트되었습니다.' })

    } catch (e: any) {
        console.error("Role Update Error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
