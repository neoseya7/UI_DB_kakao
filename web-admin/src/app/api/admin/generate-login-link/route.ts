import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// Initialize Supabase Admin strictly server-side using the Service Role Key
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
    try {
        const { store_email } = await req.json()

        if (!store_email) {
            return NextResponse.json({ success: false, error: "Store email is required" }, { status: 400 })
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
