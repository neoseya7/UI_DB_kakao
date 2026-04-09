import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(request: Request) {
    try {
        const { spreadsheet_id } = await request.json()

        if (!spreadsheet_id) {
            return NextResponse.json({ success: false, error: "스프레드시트 ID가 필요합니다." }, { status: 400 })
        }

        // Get Google Sheets API key from super_admin_config
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
        const supabase = createClient(supabaseUrl, serviceKey)

        const { data: config } = await supabase.from('super_admin_config').select('gemini_api_key').eq('id', 1).single()
        const apiKey = config?.gemini_api_key

        if (!apiKey) {
            return NextResponse.json({ success: false, error: "Google API 키가 설정되지 않았습니다." })
        }

        // Try to write a test value to cell A1
        const testUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/Sheet1!A1?valueInputOption=RAW&key=${apiKey}`
        const res = await fetch(testUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                range: 'Sheet1!A1',
                majorDimension: 'ROWS',
                values: [['연결 테스트 성공 - 이 시트에 주문 백업이 자동으로 저장됩니다.']]
            })
        })

        if (res.ok) {
            return NextResponse.json({ success: true })
        }

        const errData = await res.json().catch(() => null)
        const errMsg = errData?.error?.message || `HTTP ${res.status}`

        if (res.status === 403) {
            return NextResponse.json({ success: false, error: "권한이 없습니다. 스프레드시트 공유 설정에서 '편집자' 권한을 확인해주세요." })
        }
        if (res.status === 404) {
            return NextResponse.json({ success: false, error: "스프레드시트를 찾을 수 없습니다. URL을 다시 확인해주세요." })
        }

        return NextResponse.json({ success: false, error: errMsg })
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
