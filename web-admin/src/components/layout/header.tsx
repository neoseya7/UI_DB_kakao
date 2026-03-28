"use client"

import { Menu, UserCircle, LogOut, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"
import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"

export function Header() {
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [userId, setUserId] = useState<string | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user && user.email) {
                setUserEmail(user.email)
                setUserId(user.id)
            }
        })
    }, [])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.push('/login')
    }

    const copyStoreLink = () => {
        if (!userId) return;
        const url = `${window.location.origin}/store/${userId}`;
        navigator.clipboard.writeText(url).then(() => {
            alert("📋 고객이 접속할 수 있는 매장 주문검색 페이지 주소가 복사되었습니다!\n\n" + url);
        }).catch(() => {
            alert("주소 복사에 실패했습니다. 권한을 확인해주세요.");
        });
    }

    return (
        <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-4 lg:h-[60px] lg:px-6 shadow-sm">
            <Sheet>
                <SheetTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 md:hidden"
                    >
                        <Menu className="h-5 w-5" />
                        <span className="sr-only">Toggle navigation menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[240px] p-0 border-r-0">
                    <SheetTitle className="sr-only">모바일 메뉴</SheetTitle>
                    <Sidebar className="w-full h-full bg-white border-r-0" />
                </SheetContent>
            </Sheet>
            <div className="w-full flex-1">
                <h1 className="text-lg font-semibold tracking-tight my-0 py-0 hidden sm:block">Dashboard</h1>
            </div>
            
            {userId && (
                <div className="flex items-center">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={copyStoreLink} 
                        className="gap-1.5 h-8 text-[11px] sm:text-xs font-bold text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 shadow-sm mr-2" 
                        title="고객 주문 검색 페이지 주소 복사"
                    >
                        <Copy className="h-3.5 w-3.5" /> <span className="hidden min-[400px]:inline">퍼블릭 주소 복사</span>
                    </Button>
                </div>
            )}

            <div className="relative" ref={menuRef}>
                <Button
                    variant="ghost"
                    className="flex items-center gap-2 rounded-full px-2 sm:px-3 hover:bg-muted"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                    <UserCircle className="h-6 w-6 text-slate-600" />
                    <span className="text-sm font-medium text-slate-700 hidden sm:inline-block">
                        {userEmail ? userEmail : "로딩 중..."}
                    </span>
                </Button>
                {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
                        <div className="py-2 p-2">
                            <div className="flex flex-col space-y-1 px-3 py-2">
                                <p className="text-sm font-medium leading-none">로그인된 계정</p>
                                <p className="text-xs leading-none text-muted-foreground mt-1">{userEmail || "알 수 없음"}</p>
                            </div>
                            <div className="h-px bg-slate-200 my-2"></div>
                            <button
                                onClick={handleLogout}
                                className="flex w-full items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-slate-100 rounded-md transition-colors text-left"
                            >
                                <LogOut className="mr-2 h-4 w-4" />
                                로그아웃
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </header>
    )
}
