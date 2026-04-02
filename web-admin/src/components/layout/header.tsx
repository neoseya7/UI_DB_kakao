"use client"

import { Menu, UserCircle, LogOut, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { Sidebar } from "./sidebar"
import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"
import { useGuideMode } from "@/components/layout/guide-context"

export function Header({ isSidebarOpen, toggleSidebar }: { isSidebarOpen?: boolean; toggleSidebar?: () => void }) {
    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [userId, setUserId] = useState<string | null>(null)
    const [storeName, setStoreName] = useState<string | null>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const { isGuideMode, toggleGuideMode } = useGuideMode()

    useEffect(() => {
        const fetchUserData = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user && user.email) {
                setUserEmail(user.email)
                setUserId(user.id)
                
                const { data } = await supabase.from('stores').select('name').eq('id', user.id).single()
                if (data && data.name) {
                    setStoreName(data.name)
                }
            }
        }
        fetchUserData()
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

            {toggleSidebar && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar}
                    className="hidden md:flex shrink-0 w-8 h-8 rounded-md text-slate-500 hover:text-slate-900 border"
                    title="사이드바 메뉴 보이기/숨기기"
                >
                    <Menu className="h-4 w-4" />
                </Button>
            )}

            <div className="w-full flex-1">
                <h1 className="text-lg font-semibold tracking-tight my-0 py-0 hidden sm:block">Dashboard</h1>
            </div>
            
            {userId && (
                <div className="flex items-center gap-2">
                    {/* Guide Mode Toggle */}
                    <Button 
                        variant={isGuideMode ? "default" : "outline"} 
                        size="sm" 
                        onClick={toggleGuideMode}
                        className={`gap-1.5 h-8 text-[11px] sm:text-xs font-bold shadow-sm transition-colors ${isGuideMode ? 'bg-amber-400 hover:bg-amber-500 text-slate-900 border-amber-400' : 'text-slate-500 border-slate-300 bg-white hover:bg-slate-50 opacity-80'}`}
                        title="초보자를 위한 가이드 말풍선 켜기/끄기"
                    >
                        <span className="text-[13px]">{isGuideMode ? "💡" : "💡"}</span>
                        <span className="hidden min-[500px]:inline">{isGuideMode ? "가이드 켜짐" : "가이드 끄기"}</span>
                    </Button>

                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={copyStoreLink} 
                        className="gap-1.5 h-8 text-[11px] sm:text-xs font-bold text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 shadow-sm mr-2" 
                        title="고객 주문 검색 페이지 주소 복사"
                    >
                        <Copy className="h-3.5 w-3.5" /> <span className="hidden min-[400px]:inline">검색방 주소 복사</span>
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
                        {storeName ? storeName : (userEmail ? userEmail : "로딩 중...")}
                    </span>
                </Button>
                {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
                        <div className="py-2 p-2">
                            <div className="flex flex-col space-y-1 px-3 py-2">
                                <p className="text-sm font-bold leading-none">{storeName || "운영중인 매장"}</p>
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
