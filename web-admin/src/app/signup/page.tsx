"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { CheckCircle2 } from "lucide-react"
import Link from "next/link"

export default function SignupPage() {
    const [brandName, setBrandName] = useState("")
    const [allowedBrands, setAllowedBrands] = useState<string[]>([])
    const [isLoadingBrands, setIsLoadingBrands] = useState(true)

    const [storeName, setStoreName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [passwordConfirm, setPasswordConfirm] = useState("")
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const [isSuccess, setIsSuccess] = useState(false)

    useEffect(() => {
        const fetchBrands = async () => {
            try {
                const res = await fetch('/api/brands')
                const json = await res.json()
                if (json.success && json.brands) {
                    setAllowedBrands(json.brands)
                    if (json.brands.length > 0) {
                        setBrandName(json.brands[0])
                    }
                }
            } catch (e) {
                console.error("Brand fetch error:", e)
            } finally {
                setIsLoadingBrands(false)
            }
        }
        fetchBrands()
    }, [])

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg("")

        if (password !== passwordConfirm) {
            setErrorMsg("비밀번호가 서로 일치하지 않습니다.")
            return
        }
        if (!brandName) {
            setErrorMsg("시스템에 등록된 공식 브랜드가 없습니다. 최고 관리자에게 문의하세요.")
            return
        }

        setLoading(true)

        // Supabase 회원가입 호출 (user_metadata에 가맹점명 임시 보관)
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    brand_name: brandName,
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
                            <strong className="text-indigo-700">[{brandName}] {storeName}</strong> 가맹점 등록이 정상적으로 신청되었습니다.<br />
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
                        <div className="grid grid-cols-2 gap-2 text-left mt-2">
                            <div className="grid gap-2 text-left">
                                <Label htmlFor="brandName">브랜드 (본사) 명 <span className="text-destructive">*</span></Label>
                                {isLoadingBrands ? (
                                    <div className="h-10 px-3 py-2 border rounded-md bg-muted animate-pulse text-sm text-muted-foreground flex items-center">로딩 중...</div>
                                ) : allowedBrands.length > 0 ? (
                                    <select
                                        id="brandName"
                                        value={brandName}
                                        onChange={(e) => setBrandName(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        required
                                    >
                                        {allowedBrands.map((b, i) => (
                                            <option key={i} value={b} className="font-medium text-slate-800">{b}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="h-10 px-3 py-2 border border-rose-200 bg-rose-50 text-rose-600 rounded-md text-[13px] flex items-center font-bold shadow-sm whitespace-nowrap overflow-hidden text-ellipsis">
                                        ❌ 시스템 등록 브랜드 없음
                                    </div>
                                )}
                            </div>
                            <div className="grid gap-2 text-left">
                                <Label htmlFor="storeName">가맹점 (지점) 명 <span className="text-destructive">*</span></Label>
                                <Input id="storeName" placeholder="예: 홍대본점" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
                            </div>
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
