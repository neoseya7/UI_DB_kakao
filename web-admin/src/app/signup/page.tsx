"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CheckCircle2 } from "lucide-react"
import Link from "next/link"

export default function SignupPage() {
    const [storeName, setStoreName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [passwordConfirm, setPasswordConfirm] = useState("")
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const [isSuccess, setIsSuccess] = useState(false)

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg("")

        if (password !== passwordConfirm) {
            setErrorMsg("비밀번호가 서로 일치하지 않습니다.")
            return
        }

        setLoading(true)

        // Supabase 회원가입 호출 (user_metadata에 가맹점명 임시 보관)
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: storeName,
                    role: 'store_pending'
                }
            }
        })

        setLoading(false)

        if (error) {
            setErrorMsg(error.message)
            return
        }

        if (data.user) {
            setIsSuccess(true)
        }
    }

    if (isSuccess) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 p-4">
                <Card className="w-full max-w-md shadow-xl border-indigo-100">
                    <CardContent className="pt-10 pb-8 flex flex-col items-center text-center space-y-4">
                        <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                        <h2 className="text-2xl font-bold text-slate-800 mt-2">가입 신청 완료!</h2>
                        <p className="text-slate-600 px-4 leading-relaxed">
                            <strong className="text-indigo-700">[{storeName}]</strong> 가맹점 등록이 정상적으로 신청되었습니다.<br />
                            본 최고관리자의 승인이 완료되는 대로<br />
                            작성하신 이메일로 접속하실 수 있습니다.
                        </p>
                        <Link href="/login" className="mt-6 w-full max-w-[200px]">
                            <Button className="w-full bg-indigo-600 hover:bg-indigo-700">로그인 화면으로 이동</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 p-4">
            <Card className="w-full max-w-sm shadow-xl">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-bold tracking-tight">가맹점 등록 신청</CardTitle>
                    <CardDescription>
                        정보를 입력하여 가맹점 대시보드 사용 승인을 요청하세요.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSignup}>
                    <CardContent className="grid gap-4 mt-2">
                        {errorMsg && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md border border-red-200">
                                {errorMsg}
                            </div>
                        )}
                        <div className="grid gap-2 text-left">
                            <Label htmlFor="storeName">가맹점 (지점) 명 <span className="text-destructive">*</span></Label>
                            <Input id="storeName" placeholder="예: 홍대본점" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
                        </div>
                        <div className="grid gap-2 text-left">
                            <Label htmlFor="email">이메일 계정 <span className="text-destructive">*</span></Label>
                            <Input id="email" type="email" placeholder="store@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                        <div className="grid gap-2 text-left">
                            <Label htmlFor="password">비밀번호 <span className="text-destructive">*</span></Label>
                            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                        </div>
                        <div className="grid gap-2 text-left">
                            <Label htmlFor="passwordConfirm">비밀번호 확인 <span className="text-destructive">*</span></Label>
                            <Input id="passwordConfirm" type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required minLength={6} />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4 mt-2 border-t pt-6 bg-slate-50/50 rounded-b-xl">
                        <Button type="submit" disabled={loading} className="w-full text-base h-11 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white">
                            {loading ? "신청 처리 중..." : "가입(승인) 요청하기"}
                        </Button>
                        <div className="text-sm text-center text-muted-foreground mt-1">
                            이미 계정이 승인되셨나요? <Link href="/login" className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline">로그인 페이지</Link>
                        </div>
                        <div className="text-xs text-slate-400 text-center leading-tight mt-2">
                            💡 신청을 완료하면 최고 관리자의 승인을 거쳐야<br />정상적으로 대시보드에 로그인할 수 있습니다.
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
