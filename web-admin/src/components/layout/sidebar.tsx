"use client"

import Link from "next/link"
import { MessageSquare, Calendar, Store, Settings, ShieldAlert, LogOut, Blocks, BarChart3 } from "lucide-react"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"

export function Sidebar({ className }: { className?: string }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.email?.toLowerCase().includes('admin')) {
        setIsAdmin(true)
      }
      setIsLoaded(true)
    })
  }, [])

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!isLoaded) return <div className={className || "hidden border-r bg-muted/40 md:block w-full min-h-screen h-full"}></div>

  return (
    <div className={className || "hidden border-r bg-muted/40 md:block w-full min-h-screen h-full"}>
      <div className="flex h-full max-h-screen flex-col gap-2 relative">
        <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Store className="h-6 w-6" />
            <span className="">프랜차이즈 어드민</span>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4 gap-1">
            {!isAdmin && (
              <>
                <Link
                  href="/"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-brand font-medium bg-muted/50 transition-all hover:text-brand"
                >
                  <MessageSquare className="h-4 w-4" />
                  오늘의 대화
                </Link>
                <Link
                  href="/pickup"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                >
                  <Calendar className="h-4 w-4" />
                  주문관리
                </Link>
                <Link
                  href="/products"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                >
                  <Store className="h-4 w-4" />
                  상품 관리
                </Link>
                <Link
                  href="/utilities"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                >
                  <Blocks className="h-4 w-4" />
                  부가기능
                </Link>
                <Link
                  href="/analytics"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                >
                  <BarChart3 className="h-4 w-4" />
                  매출통계
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                >
                  <Settings className="h-4 w-4" />
                  매장 설정
                </Link>
              </>
            )}

            <div className={`mt-4 pt-2 ${!isAdmin ? 'border-t border-border/50' : ''}`}>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-indigo-700 bg-indigo-50/50 transition-all hover:bg-indigo-100/50 font-semibold"
                >
                  <ShieldAlert className="h-4 w-4" />
                  * 시스템 최고 관리자
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="w-full text-left flex items-center gap-3 rounded-lg px-3 py-2 mt-1 text-muted-foreground transition-all hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                로그아웃
              </button>
            </div>
          </nav>
        </div>
      </div>
    </div>
  )
}
