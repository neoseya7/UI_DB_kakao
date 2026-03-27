"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [isAuthorized, setIsAuthorized] = useState(false)

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                // Not logged in -> Redirect to login without rendering the dashboard structure
                router.replace('/login')
                return
            }
            setIsAuthorized(true)
        }
        checkAuth()

        // Also listen to auth state changes (e.g. logging out in another tab)
        const { data: authListener } = supabase.auth.onAuthStateChange(
            (event, session) => {
                if (event === 'SIGNED_OUT' || !session) {
                    router.replace('/login')
                }
            }
        )

        return () => {
            authListener.subscription.unsubscribe()
        }
    }, [router])

    if (!isAuthorized) {
        // Render a full-screen stealthy loader during SSR and initial client hydration to prevent layout leaks
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50 w-full">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
                    <p className="text-slate-500 font-bold text-sm">시스템 보안 권한 확인 중...</p>
                </div>
            </div>
        )
    }

    return <>{children}</>
}
