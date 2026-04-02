import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
    try {
        // Initialize Supabase Admin strictly server-side using the Service Role Key at runtime
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json({ success: false, error: "Server misconfiguration" }, { status: 500 });
        }
        
        const supabaseAdmin = createClient(supabaseUrl, serviceKey);

        const { store_email } = await req.json()

        if (!store_email) {
            return NextResponse.json({ success: false, error: "Store email is required" }, { status: 400 })
        }

        // SECURITY PATCH: Verify the token to ensure caller is an actual Admin
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return NextResponse.json({ success: false, error: "Unauthorized: Missing authorization header" }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token)

        if (userErr || !user) {
            return NextResponse.json({ success: false, error: "Unauthorized: Invalid or expired token" }, { status: 401 })
        }

        const role = user.user_metadata?.role
        const fallbackAdmin = user.email?.toLowerCase().includes('admin')
        const isSuperAdmin = role === 'super_admin' || fallbackAdmin
        const isBrandAdmin = role === 'brand_admin' || isSuperAdmin

        if (!isSuperAdmin && !isBrandAdmin) {
            return NextResponse.json({ success: false, error: "Forbidden: You do not have permission to impersonate accounts" }, { status: 403 })
        }

        // Generate a magic link for the target user using Supabase Admin Auth API
        // This generates a one-time use URL that instantly logs the viewer in as the target email.
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email: store_email,
        })

        if (error || !data?.properties?.action_link) {
            return NextResponse.json({ success: false, error: error?.message || "Failed to generate link" })
        }

        // Ensure dynamic host replacement if Supabase is still defaulting to localhost
        let actionLink = data.properties.action_link;
        
        // Reconstruct the actual current domain (Vercel or local)
        const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host');
        
        if (actionLink.includes('localhost') || actionLink.includes('127.0.0.1')) {
            if (hostHeader && !hostHeader.includes('localhost') && !hostHeader.includes('127.0.0.1')) {
                const protocol = req.headers.get('x-forwarded-proto') || 'https';
                const realOrigin = `${protocol}://${hostHeader}`;
                actionLink = actionLink.replace(/https?:\/\/localhost(:\d+)?/gi, realOrigin);
                actionLink = actionLink.replace(/https?:\/\/127\.0\.0\.1(:\d+)?/gi, realOrigin);
            } else {
                // Hard Regex Fallback if all else fails
                actionLink = actionLink.replace(/https?:\/\/localhost(:\d+)?/gi, 'https://ui-db-kakao.vercel.app');
                actionLink = actionLink.replace(/https?:\/\/127\.0\.0\.1(:\d+)?/gi, 'https://ui-db-kakao.vercel.app');
            }
        }

        return NextResponse.json({ success: true, link: actionLink })

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
