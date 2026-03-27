"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import Link from "next/link"

export default function LoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg("")
        setLoading(true)

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            setErrorMsg(error.message)
            setLoading(false)
            return
        }

        // Check if super admin or normal user
        if (email.startsWith("admin@")) {
            router.push("/admin")
        } else {
            router.push("/")
        }
    }

    return (
        <div className="flex h-screen w-full items-center justify-center bg-muted/30 p-4">
            <Card className="w-full max-w-sm shadow-xl">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-bold tracking-tight">관리자 로그인</CardTitle>
                    <CardDescription>
                        본사 또는 가맹점 계정 이메일과 비밀번호를 입력하세요.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleLogin}>
                    <CardContent className="grid gap-4">
                        {errorMsg && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md border border-red-200">
                                로그인 실패: {errorMsg}
                            </div>
                        )}
                        <div className="grid gap-2 text-left">
                            <Label htmlFor="email">이메일</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="grid gap-2 text-left">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">비밀번호</Label>
                                <Link href="#" className="text-sm text-primary hover:underline">
                                    비밀번호 찾기
                                </Link>
                            </div>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full text-base h-11 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {loading ? "로그인 중..." : "로그인 (대시보드 입장)"}
                        </Button>
                        <div className="text-sm text-center mt-1 text-slate-500">
                            아직 가맹점이 아니신가요? <Link href="/signup" className="text-indigo-600 font-bold hover:text-indigo-800 hover:underline">가맹점 등록 신청</Link>
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
