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
    const [ownerName, setOwnerName] = useState("")
    const [phone, setPhone] = useState("")
    const [bizNumber, setBizNumber] = useState("")
    const [bizType, setBizType] = useState("")
    const [bizCategory, setBizCategory] = useState("")
    const [bizAddress, setBizAddress] = useState("")

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

        // Supabase 회원가입 호출 (user_metadata에 사업자 정보 보관)
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: storeName,
                    role: 'store_pending',
                    // B2B Required Fields
                    owner_name: ownerName,
                    phone: phone,
                    biz_number: bizNumber,
                    biz_type: bizType,
                    biz_category: bizCategory,
                    biz_address: bizAddress
                }
            }
        })

        setLoading(false)

        if (error) {
            setErrorMsg(error.message)
            return
        }

        if (data.user) {
            try {
                // Call secure backend to insert into public.stores table bypassing RLS
                await fetch('/api/auth/register-store', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: data.user.id,
                        email: email,
                        store_name: storeName
                    })
                })
            } catch (err) {
                console.error("Failed to insert store record", err)
            }
            setIsSuccess(true)
        }
    }

    if (isSuccess) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 p-4">
                <Card className="w-full max-w-md shadow-xl border-indigo-100">
                    <CardContent className="pt-10 pb-8 flex flex-col items-center text-center space-y-4">
                        <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                        <h2 className="text-2xl font-bold text-slate-800 mt-2">가맹점 가입 심사 중</h2>
                        <p className="text-slate-600 px-4 leading-relaxed">
                            <strong className="text-indigo-700">[{storeName}]</strong> 사업자 정보가 본사 서버로 안전하게 접수되었습니다.<br />
                            심사 처리 및 <strong>[본사 브랜드 할당]</strong>이 완료되는 즉시<br />
                            입력하신 이메일로 시스템에 로그인하실 수 있습니다.
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
        <div className="flex min-h-screen w-full items-center justify-center bg-muted/30 p-4 py-12">
            <Card className="w-full max-w-2xl shadow-xl">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-bold tracking-tight">가맹점 계정 발급 신청</CardTitle>
                    <CardDescription>
                        사업자 상세 정보를 입력하여 가맹점 대시보드 사용 승인을 본사에 요청하세요.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSignup}>
                    <CardContent className="grid gap-6 mt-2">
                        {errorMsg && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md border border-red-200">
                                {errorMsg}
                            </div>
                        )}

                        <div className="grid md:grid-cols-2 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                            {/* Left Column */}
                            <div className="space-y-4">
                                <div className="grid gap-2 text-left">
                                    <Label htmlFor="storeName">가맹점 (지점) 명 <span className="text-destructive">*</span></Label>
                                    <Input id="storeName" placeholder="예: 홍대본점" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
                                </div>
                                <div className="grid gap-2 text-left">
                                    <Label htmlFor="ownerName">점주 이름 (대표자) <span className="text-destructive">*</span></Label>
                                    <Input id="ownerName" placeholder="홍길동" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
                                </div>
                                <div className="grid gap-2 text-left">
                                    <Label htmlFor="phone">전화번호 (연락처) <span className="text-destructive">*</span></Label>
                                    <Input id="phone" placeholder="010-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                                </div>
                                <div className="grid gap-2 text-left">
                                    <Label htmlFor="bizNumber">사업자 등록번호 <span className="text-destructive">*</span></Label>
                                    <Input id="bizNumber" placeholder="123-45-67890" value={bizNumber} onChange={(e) => setBizNumber(e.target.value)} required />
                                </div>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="grid gap-2 text-left">
                                        <Label htmlFor="bizType">업태</Label>
                                        <Input id="bizType" placeholder="도소매" value={bizType} onChange={(e) => setBizType(e.target.value)} />
                                    </div>
                                    <div className="grid gap-2 text-left">
                                        <Label htmlFor="bizCategory">업종</Label>
                                        <Input id="bizCategory" placeholder="식음료" value={bizCategory} onChange={(e) => setBizCategory(e.target.value)} />
                                    </div>
                                </div>
                                <div className="grid gap-2 text-left">
                                    <Label htmlFor="bizAddress">사업장 상세 주소 <span className="text-destructive">*</span></Label>
                                    <Input id="bizAddress" placeholder="서울특별시 강남구 테헤란로 123" value={bizAddress} onChange={(e) => setBizAddress(e.target.value)} required />
                                </div>

                                <div className="pt-2 border-t border-slate-200/60 mt-4 space-y-4">
                                    <div className="grid gap-2 text-left">
                                        <Label htmlFor="email">관리용 이메일 계정 (ID) <span className="text-destructive">*</span></Label>
                                        <Input id="email" type="email" placeholder="store@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-indigo-50/30" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="grid gap-2 text-left">
                                            <Label htmlFor="password">비밀번호 <span className="text-destructive">*</span></Label>
                                            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                                        </div>
                                        <div className="grid gap-2 text-left">
                                            <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
                                            <Input id="passwordConfirm" type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} required minLength={6} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </CardContent>
                    <CardFooter className="flex flex-col gap-4 mt-2 pt-6 bg-slate-50/50 rounded-b-xl border-t">
                        <Button type="submit" disabled={loading} className="w-full text-base h-11 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white">
                            {loading ? "보안망으로 사업자 데이터 암호화 전송 중..." : "본사에 시스템 계정 발급(승인) 요청하기"}
                        </Button>
                        <div className="text-sm text-center text-muted-foreground mt-1">
                            이미 심사가 끝난 승인된 계정인가요? <Link href="/login" className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline">로그인 페이지 이동</Link>
                        </div>
                        <div className="text-xs text-slate-400 text-center leading-tight mt-2 pb-2">
                            💡 제출하신 사업자 및 점수 상세 정보는 철저한 암호화 후 영업비밀로 보호됩니다.<br />
                            본 최고관리자의 승인 및 [공식 브랜드 할당] 과정이 누락되면 시스템 로그인이 제한됩니다.
                        </div>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
