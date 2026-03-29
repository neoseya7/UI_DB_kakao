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
        const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://ui-db-kakao.vercel.app';
        
        if (actionLink.includes('localhost:3000')) {
            actionLink = actionLink.replace(/http:\/\/localhost:3000/g, origin);
        }

        return NextResponse.json({ success: true, link: actionLink })

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
