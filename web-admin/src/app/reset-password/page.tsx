"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

export default function ResetPasswordPage() {
    const router = useRouter()
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const [successMsg, setSuccessMsg] = useState("")
    
    useEffect(() => {
        // Automatically check if the user is in a recovery session
        const checkSession = async () => {
            const { data } = await supabase.auth.getSession()
            if (!data.session) {
                // If there's no session, they probably didn't click a valid link or it expired.
                // Supabase hash `#access_token=...&type=recovery` handles creating the session automatically.
                // We'll just wait a bit for the provider to parse the URL hash.
            }
        }
        checkSession()
    }, [])

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg("")
        setSuccessMsg("")

        if (password !== confirmPassword) {
            setErrorMsg("비밀번호가 일치하지 않습니다.")
            return
        }

        if (password.length < 6) {
            setErrorMsg("비밀번호는 최소 6자 이상이어야 합니다.")
            return
        }

        setLoading(true)

        const { error } = await supabase.auth.updateUser({
            password: password
        })

        if (error) {
            setErrorMsg("비밀번호 변경 실패: " + error.message)
            setLoading(false)
            return
        }

        setSuccessMsg("비밀번호가 성공적으로 변경되었습니다! 3초 후 대시보드로 이동합니다.")
        
        setTimeout(() => {
            router.push("/")
        }, 3000)
    }

    return (
        <div className="flex h-screen w-full items-center justify-center bg-muted/30 p-4">
            <Card className="w-full max-w-sm shadow-xl">
                <CardHeader className="space-y-1 text-center">
                    <CardTitle className="text-2xl font-bold tracking-tight">새 비밀번호 설정</CardTitle>
                    <CardDescription>
                        사용하실 새로운 비밀번호를 입력해주세요.
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleResetPassword}>
                    <CardContent className="grid gap-4">
                        {errorMsg && (
                            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md border border-red-200">
                                {errorMsg}
                            </div>
                        )}
                        {successMsg && (
                            <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md border border-green-200">
                                {successMsg}
                            </div>
                        )}
                        <div className="grid gap-2 text-left">
                            <Label htmlFor="password">새 비밀번호</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="최소 6자 이상"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="grid gap-2 text-left">
                            <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="비밀번호 다시 입력"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-4">
                        <Button
                            type="submit"
                            disabled={loading || successMsg.length > 0}
                            className="w-full text-base h-11 font-bold shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            {loading ? "변경 중..." : "비밀번호 변경하기"}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    )
}
