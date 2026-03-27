"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Check, X, Save, Copy, Store, FileText, Settings2, Power, KeyRound } from "lucide-react"

// A dedicated component for individual prompt textareas to manage local typing state safely
function PromptEditorCard({ title, desc, model, initialValue, onSave }: { title: string, desc: string, model: string, initialValue: string, onSave: (val: string) => void }) {
    const [val, setVal] = useState(initialValue)

    // Sync if initialValue changes from DB fetch
    useEffect(() => { setVal(initialValue) }, [initialValue])

    const handleCopy = () => {
        navigator.clipboard.writeText(val)
        alert("프롬프트가 복사되었습니다.")
    }

    return (
        <Card className="border-indigo-100 shadow-md bg-white hover:border-indigo-300 transition-colors h-full flex flex-col">
            <CardHeader className="bg-indigo-50/30 border-b border-indigo-100 py-4">
                <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1.5">
                        <CardTitle className="text-base text-indigo-950 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-indigo-500" /> {title}
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500 leading-tight pr-2">{desc}</CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-white border border-slate-200 text-slate-700 whitespace-nowrap shadow-sm font-semibold">{model}</Badge>
                </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col">
                <textarea
                    className="flex flex-1 min-h-[300px] w-full border-0 bg-slate-50/50 px-4 py-4 text-[13px] focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-indigo-400 font-mono leading-relaxed resize-y"
                    value={val}
                    onChange={e => setVal(e.target.value)}
                />
            </CardContent>
            <CardFooter className="bg-slate-50 border-t p-3 flex flex-wrap justify-between items-center gap-2 rounded-b-xl">
                <span className="text-xs text-muted-foreground font-mono hidden xl:inline-block">실시간 바인딩 활성화됨</span>
                <div className="flex gap-2 w-full md:w-auto ml-auto">
                    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2 bg-white font-medium flex-1 md:flex-none">
                        <Copy className="w-3.5 h-3.5" /> 복사
                    </Button>
                    <Button size="sm" onClick={() => onSave(val)} className="gap-2 shadow-sm font-bold bg-indigo-600 hover:bg-indigo-700 flex-1 md:flex-none">
                        <Save className="w-3.5 h-3.5" /> DB 저장
                    </Button>
                </div>
            </CardFooter>
        </Card>
    )
}

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState("stores")
    const [isLoading, setIsLoading] = useState(true)

    const [stores, setStores] = useState<any[]>([])
    const [kakaoRoomNames, setKakaoRoomNames] = useState<Record<string, string>>({})
    const [adminConfig, setAdminConfig] = useState<any>({
        gemini_api_key: "", gemini_model: "gemini-1.5-flash", openai_api_key: "", openai_model: "gpt-4o-mini",
        prompt_set_1: {}, prompt_set_2: {}, allowed_brands: []
    })

    // Brand tag input state
    const [newBrand, setNewBrand] = useState("")

    useEffect(() => {
        const fetchAdminData = async () => {
            setIsLoading(true)

            // 1. Fetch stores
            const { data: storesData } = await supabase.from('stores').select('*').order('created_at', { ascending: false })
            if (storesData) {
                setStores(storesData)
            }

            // 1-1. Fetch store_settings via API (bypassing RLS)
            try {
                const res = await fetch('/api/admin/store-settings')
                if (res.ok) {
                    const result = await res.json()
                    if (result.success && result.data) {
                        const roomNamesObj: Record<string, string> = {}
                        result.data.forEach((s: any) => {
                            if (s.kakao_room_name) {
                                roomNamesObj[s.store_id] = s.kakao_room_name
                            }
                        })
                        setKakaoRoomNames(roomNamesObj)
                    }
                }
            } catch (err) {
                console.error("Failed to fetch store settings", err)
            }

            // 2. Fetch config (id=1)
            const { data: configData } = await supabase.from('super_admin_config').select('*').eq('id', 1).single()
            if (configData) {
                // Ensure JSONB is parsed if coming in as string occasionally
                const parsedConfig = { ...configData }
                if (typeof parsedConfig.prompt_set_1 === 'string') parsedConfig.prompt_set_1 = JSON.parse(parsedConfig.prompt_set_1)
                if (typeof parsedConfig.prompt_set_2 === 'string') parsedConfig.prompt_set_2 = JSON.parse(parsedConfig.prompt_set_2)
                if (typeof parsedConfig.allowed_brands === 'string') parsedConfig.allowed_brands = JSON.parse(parsedConfig.allowed_brands)

                // Fallback ensure it is an array
                if (!Array.isArray(parsedConfig.allowed_brands)) parsedConfig.allowed_brands = []

                setAdminConfig(parsedConfig)
            }

            setIsLoading(false)
        }
        fetchAdminData()
    }, [activeTab])

    const pendingAccounts = stores.filter(s => s.status === 'pending')
    const activeStores = stores.filter(s => s.status !== 'pending')

    // Handlers
    const handleApproveStore = async (storeId: string) => {
        const { error } = await supabase.from('stores').update({ status: 'active' }).eq('id', storeId)
        if (!error) {
            setStores(prev => prev.map(s => s.id === storeId ? { ...s, status: 'active' } : s))
            alert("가맹점 승인이 완료되었습니다!")
        }
    }

    const handleRejectStore = async (storeId: string) => {
        const { error } = await supabase.from('stores').delete().eq('id', storeId)
        if (!error) {
            setStores(prev => prev.filter(s => s.id !== storeId))
            alert("승인이 거절되어 삭제되었습니다.")
        }
    }

    const handleToggleStoreStatus = async (storeId: string, currentStatus: string) => {
        const newStatus = currentStatus === 'active' ? 'suspended' : 'active'
        const { error } = await supabase.from('stores').update({ status: newStatus }).eq('id', storeId)
        if (!error) setStores(prev => prev.map(s => s.id === storeId ? { ...s, status: newStatus } : s))
    }

    const handleSaveKakaoRoomName = async (storeId: string) => {
        const roomName = kakaoRoomNames[storeId] || ''

        try {
            const res = await fetch('/api/admin/update-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ store_id: storeId, kakao_room_name: roomName })
            })

            const data = await res.json()
            if (!data.success) {
                alert(`매장명 저장 실패: ${data.error}`)
            } else {
                alert('카카오톡 수집 매장명이 성공적으로 저장되었습니다.')
            }
        } catch (err: any) {
            alert(`매장명 저장 중 오류 발생: ${err.message}`)
        }
    }

    // Config Save Logic (Upsert emulation to fix missing row bug)
    const handleSaveMultipleConfig = async (updates: any) => {
        // Try Update
        const { error, data } = await supabase.from('super_admin_config').update(updates).eq('id', 1).select()
        if (error) {
            alert(`설정 저장 중 오류: ${error.message}`)
            return
        }
        // If DB initially empty (row id=1 does not exist), then Insert
        if (!data || data.length === 0) {
            const { error: insertErr } = await supabase.from('super_admin_config').insert({ id: 1, ...updates })
            if (insertErr) {
                alert(`설정 생성 중 오류: ${insertErr.message}`)
                return
            }
        }
        setAdminConfig((prev: any) => ({ ...prev, ...updates }))
        alert("최고 관리자 DB에 설정이 안전하게 저장되었습니다!")
    }

    // Prompt Parsing Helpers
    const getPrompt = (configKey: 'prompt_set_1' | 'prompt_set_2', jsonField: string, defaultText: string) => {
        const obj = adminConfig[configKey] || {}
        return obj[jsonField] || defaultText
    }

    const savePrompt = (configKey: 'prompt_set_1' | 'prompt_set_2', jsonField: string, val: string) => {
        const obj = adminConfig[configKey] || {}
        const newObj = { ...obj, [jsonField]: val }
        handleSaveMultipleConfig({ [configKey]: newObj })
    }

    // Brand Logic Methods
    const handleAddBrand = () => {
        const b = newBrand.trim()
        if (!b) return
        if (adminConfig.allowed_brands.includes(b)) {
            alert("이미 등록된 브랜드입니다.")
            return
        }

        const newBrands = [...adminConfig.allowed_brands, b]
        handleSaveMultipleConfig({ allowed_brands: newBrands })
        setNewBrand("")
    }

    const handleRemoveBrand = (brandToRemove: string) => {
        if (!confirm(`'${brandToRemove}' 브랜드를 정말 삭제하시겠습니까? (기존에 가입된 가맹점에는 영향을 주지 않습니다)`)) return
        const newBrands = adminConfig.allowed_brands.filter((b: string) => b !== brandToRemove)
        handleSaveMultipleConfig({ allowed_brands: newBrands })
    }

    const renderPromptSet = (setName: string, configKey: 'prompt_set_1' | 'prompt_set_2') => (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-col gap-2 mb-6 p-4 bg-indigo-50/50 rounded-lg border border-indigo-100">
                <h3 className="text-xl font-bold tracking-tight text-indigo-900">{setName} 에디터</h3>
                <p className="text-sm text-indigo-800/70">챗봇 파싱에 활용할 프롬프트를 모델별로 관리합니다. DB의 JSONB 컬럼에 단일 항목별로 즉시 자동 맵핑되어 저장됩니다.</p>
            </div>

            <div className="grid xl:grid-cols-2 gap-8 mt-4">
                <div className="space-y-6">
                    <div className="flex items-center gap-3 border-b-2 border-blue-500/20 pb-2">
                        <h4 className="font-bold text-lg text-blue-800">Gemini (Google) 전용</h4>
                        <Badge className="bg-blue-100 text-blue-800">1.5 Pro 호환</Badge>
                    </div>
                    <PromptEditorCard
                        title={`Prompt A (Gemini) - ${setName}`}
                        desc="메시지 의도 고속 분류 파싱 로직"
                        model="Gemini Model"
                        initialValue={getPrompt(configKey, 'gemini_a', "You are an AI intent classifier. Analyze the provided message and determine the category out of [order, inquiry, complaint]. Return purely the category keyword in uppercase.")}
                        onSave={(val) => savePrompt(configKey, 'gemini_a', val)}
                    />
                    <PromptEditorCard
                        title={`Prompt B (Gemini) - ${setName}`}
                        desc="정규형 배열 심화 추출 로직"
                        model="Gemini Model"
                        initialValue={getPrompt(configKey, 'gemini_b', "CRITICAL RULES:\n1. Exact matches only based on phonetic parsing. Do NOT semantically replace product names.\n2. Output JSON array purely.")}
                        onSave={(val) => savePrompt(configKey, 'gemini_b', val)}
                    />
                </div>

                <div className="space-y-6">
                    <div className="flex items-center gap-3 border-b-2 border-emerald-500/20 pb-2">
                        <h4 className="font-bold text-lg text-emerald-800">ChatGPT (OpenAI) 전용</h4>
                        <Badge className="bg-emerald-100 text-emerald-800">GPT-4o 호환</Badge>
                    </div>
                    <PromptEditorCard
                        title={`Prompt A (GPT) - ${setName}`}
                        desc="메시지 의도 고속 분류 파싱 로직"
                        model="GPT Model"
                        initialValue={getPrompt(configKey, 'gpt_a', "Act as an intent assistant. Classify user message into [Order, Inquiry, Complaint]. Output strictly raw text of category without wrappers.")}
                        onSave={(val) => savePrompt(configKey, 'gpt_a', val)}
                    />
                    <PromptEditorCard
                        title={`Prompt B (GPT) - ${setName}`}
                        desc="정규형 배열 심화 추출 로직"
                        model="GPT Model"
                        initialValue={getPrompt(configKey, 'gpt_b', "System instructions: Parse user input rigorously.\nRULE 1: Map extracted names ONLY to the exact items provided.\nRULE 2: Output JSON stringified array.")}
                        onSave={(val) => savePrompt(configKey, 'gpt_b', val)}
                    />
                </div>
            </div>
        </div>
    )

    return (
        <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-10 px-2 lg:px-4">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 border-b border-border/80 pb-4">
                    <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mr-2">최고 관리자</span>
                    클라우드 대시보드
                </h2>
            </div>

            <div className="flex overflow-x-auto bg-muted/40 border rounded-lg p-1.5 w-full md:w-fit shadow-sm gap-1 scrollbar-hide">
                <button onClick={() => setActiveTab("stores")} className={`px-4 py-2.5 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 whitespace-nowrap min-w-[140px] ${activeTab === 'stores' ? 'bg-white shadow border border-slate-200/60 text-indigo-700' : 'text-slate-600 hover:text-indigo-900 hover:bg-white/50'}`}>
                    <Store className="w-4 h-4" /> 가맹점 승인/관리
                </button>
                <button onClick={() => setActiveTab("brands")} className={`px-4 py-2.5 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 whitespace-nowrap min-w-[140px] ${activeTab === 'brands' ? 'bg-amber-600 shadow border border-amber-700 text-white' : 'text-slate-600 hover:text-amber-900 hover:bg-white/50'}`}>
                    <Store className="w-4 h-4 opacity-80" /> 공식 브랜드 등록
                </button>
                <div className="w-px h-6 bg-slate-300 mx-2 self-center shrink-0"></div>
                <button onClick={() => setActiveTab("prompt1")} className={`px-4 py-2.5 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 whitespace-nowrap min-w-[160px] ${activeTab === 'prompt1' ? 'bg-indigo-600 shadow-md text-white' : 'text-slate-600 hover:text-indigo-900 hover:bg-white/50'}`}>
                    <FileText className="w-4 h-4 opacity-80" /> 프롬프트 세트 1호기
                </button>
                <button onClick={() => setActiveTab("prompt2")} className={`px-4 py-2.5 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 whitespace-nowrap min-w-[160px] ${activeTab === 'prompt2' ? 'bg-emerald-600 shadow-md text-white' : 'text-slate-600 hover:text-emerald-900 hover:bg-white/50'}`}>
                    <Settings2 className="w-4 h-4 opacity-80" /> 프롬프트 세트 2호기
                </button>
                <div className="w-px h-6 bg-slate-300 mx-2 self-center shrink-0"></div>
                <button onClick={() => setActiveTab("api")} className={`px-4 py-2.5 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-2 whitespace-nowrap min-w-[140px] ${activeTab === 'api' ? 'bg-slate-800 shadow-md text-white' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'}`}>
                    <KeyRound className="w-4 h-4 opacity-80" /> [보안] API 연동 설정
                </button>
            </div>

            {activeTab === 'stores' && (
                <div className="space-y-10 animate-in fade-in duration-300 ease-out mt-2">
                    <section>
                        <h3 className="text-xl font-bold tracking-tight flex items-center gap-2.5 mb-5 pb-2 border-b border-amber-500/20">
                            <span className="text-amber-600">신규 가맹점 승인 대기열</span>
                            <Badge className="bg-amber-500 rounded-full px-2 shadow-sm font-mono text-base">{pendingAccounts.length}</Badge>
                        </h3>
                        {pendingAccounts.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground bg-white border border-dashed rounded-lg">승인 대기 중인 계정이 없습니다.</div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {pendingAccounts.map((acc: any) => (
                                    <Card key={acc.id} className="flex flex-col xl:flex-row xl:items-center justify-between p-5 bg-white shadow-sm border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
                                        <div className="flex flex-col gap-1.5 mb-4 xl:mb-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-lg text-slate-800">{acc.name}</span>
                                                <Badge variant="outline" className="bg-amber-50/80 text-amber-700 border-amber-300 font-semibold px-2 py-0.5">대기중</Badge>
                                            </div>
                                            <span className="text-sm text-slate-500 font-mono">{acc.email}</span>
                                        </div>
                                        <div className="flex xl:flex-col gap-2 w-full xl:w-[120px]">
                                            <Button onClick={() => handleApproveStore(acc.id)} className="flex-1 xl:w-full bg-emerald-600 hover:bg-emerald-700 shadow-sm gap-1.5 font-bold h-9">
                                                <Check className="w-4 h-4" /> 승인 허가
                                            </Button>
                                            <Button onClick={() => handleRejectStore(acc.id)} variant="outline" className="flex-1 xl:w-full text-rose-600 border-rose-200 hover:bg-rose-50 gap-1.5 font-bold h-9">
                                                <X className="w-4 h-4" /> 거절
                                            </Button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </section>

                    <section>
                        <h3 className="text-xl font-bold tracking-tight flex items-center gap-2.5 mb-5 pb-2 border-b border-emerald-500/20">
                            <span className="text-emerald-700">운영 중인 가맹점 목록</span>
                            <Badge className="bg-emerald-600 rounded-full px-2 shadow-sm font-mono text-base">{activeStores.length}</Badge>
                        </h3>
                        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50/80 border-b">
                                    <tr>
                                        <th className="px-5 py-3.5 font-semibold text-slate-600">ID</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-600">가맹점 명</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-600">수집 매장명(카톡)</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-600">대표 계정</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-600">상태</th>
                                        <th className="px-5 py-3.5 font-semibold text-slate-600 text-right">옵션</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {activeStores.length === 0 && (<tr><td colSpan={5} className="p-6 text-center text-muted-foreground">현재 운영 중인 매장이 없습니다.</td></tr>)}
                                    {activeStores.map((store: any) => (
                                        <tr key={store.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-5 py-3 font-mono text-slate-500">
                                                <div className="flex items-center gap-1.5">
                                                    {store.id.substring(0, 8)}...
                                                    <button onClick={() => { navigator.clipboard.writeText(store.id); alert("매장 UUID가 복사되었습니다!\n\n" + store.id); }} className="text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 p-1 rounded transition-colors" title="전체 UUID 복사">
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 font-bold text-slate-800">{store.name}</td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        value={kakaoRoomNames[store.id] || ''}
                                                        onChange={e => setKakaoRoomNames(prev => ({ ...prev, [store.id]: e.target.value }))}
                                                        placeholder="예: 서울강남점"
                                                        className="h-8 w-[140px] text-sm"
                                                    />
                                                    <Button onClick={() => handleSaveKakaoRoomName(store.id)} size="sm" variant="outline" className="h-8">저장</Button>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 text-slate-600">{store.email}</td>
                                            <td className="px-5 py-3">
                                                {store.status === "active" ? (
                                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">정상운영</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-300">일시정지</Badge>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <Button onClick={() => handleToggleStoreStatus(store.id, store.status)} variant="secondary" size="sm" className={`h-8 gap-1.5 font-medium ${store.status === 'active' ? 'text-rose-600 bg-rose-50 hover:bg-rose-100' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'}`}>
                                                    <Power className="w-3.5 h-3.5" /> {store.status === 'active' ? '정지' : '재개'}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'brands' && (
                <div className="space-y-6 animate-in fade-in duration-300 ease-out mt-2">
                    <div className="flex flex-col gap-2 p-4 bg-amber-50/50 rounded-lg border border-amber-100">
                        <h3 className="text-xl font-bold tracking-tight text-amber-900 flex items-center gap-2">
                            <Store className="w-5 h-5" /> 공식 브랜드명 통합 레지스트리
                        </h3>
                        <p className="text-sm text-amber-800/70">
                            이곳에 등록된 공식 브랜드 이름만 신규 가입자(가맹점)의 드롭다운 선택 메뉴에 노출됩니다. 띄어쓰기 오타 발생 및 파편화를 원천 차단하여 카탈로그의 정합성을 보장합니다.
                        </p>
                    </div>

                    <Card className="border-slate-200 shadow-sm bg-white">
                        <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
                            <CardTitle className="text-lg text-slate-800 font-extrabold flex items-center gap-2">신규 브랜드 발행하기</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            <div className="flex gap-2 w-full max-w-sm">
                                <Input
                                    value={newBrand}
                                    onChange={e => setNewBrand(e.target.value)}
                                    placeholder="정확한 공식 브랜드명 입력 (예: 스타벅스)"
                                    className="font-bold border-slate-300 focus-visible:ring-amber-500 h-11"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddBrand() }}
                                />
                                <Button onClick={handleAddBrand} className="bg-amber-600 hover:bg-amber-700 font-bold shadow-sm h-11 px-6">
                                    <Check className="w-4 h-4 mr-1" /> 추가
                                </Button>
                            </div>

                            <div className="pt-2 border-t mt-6">
                                <Label className="font-bold text-sm text-slate-800 block mb-4">현재 시스템에 등록된 스토어 프랜차이즈 목록</Label>
                                <div className="flex flex-wrap gap-2.5">
                                    {(!adminConfig.allowed_brands || adminConfig.allowed_brands.length === 0) && (
                                        <span className="text-muted-foreground text-sm italic">등록된 브랜드가 없습니다.</span>
                                    )}
                                    {adminConfig.allowed_brands?.map((brand: string, idx: number) => (
                                        <Badge key={idx} className="px-3.5 py-1.5 flex items-center gap-1.5 text-sm font-bold bg-white text-slate-800 border-2 border-slate-200 shadow-sm transition-all hover:border-amber-300">
                                            {brand}
                                            <button
                                                onClick={() => handleRemoveBrand(brand)}
                                                className="ml-1 text-slate-400 hover:text-red-500 transition-colors bg-slate-100 hover:bg-red-50 rounded-full p-0.5"
                                                title="브랜드 삭제"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {activeTab === 'prompt1' && renderPromptSet("세트 1호기", "prompt_set_1")}
            {activeTab === 'prompt2' && renderPromptSet("세트 2호기", "prompt_set_2")}

            {activeTab === 'api' && (
                <div className="space-y-6 animate-in fade-in duration-300 ease-out mt-2">
                    <div className="flex flex-col gap-2 mb-6 p-4 bg-slate-100/50 rounded-lg border border-slate-200">
                        <h3 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                            <KeyRound className="w-5 h-5" /> 클라우드 API 연동 키 관리
                        </h3>
                        <p className="text-sm text-slate-600">주문수집 서버 파싱에 쓰이는 LLM API 인증키를 등록합니다.</p>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-8">
                        <Card className="border-blue-200 shadow-sm bg-white">
                            <CardHeader className="bg-blue-50/50 border-b border-blue-100"><CardTitle className="text-lg text-blue-900 font-extrabold flex items-center gap-2">Google Gemini API</CardTitle></CardHeader>
                            <CardContent className="pt-6 space-y-5">
                                <div className="space-y-2">
                                    <Label className="font-bold text-[13px] text-blue-900">API Key 인증 토큰</Label>
                                    <Input type="password" value={adminConfig.gemini_api_key || ""} onChange={(e) => setAdminConfig({ ...adminConfig, gemini_api_key: e.target.value })} className="font-mono bg-slate-50 focus-visible:ring-blue-500 h-10" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="font-bold text-[13px] text-blue-900">활성화된 API 모델명</Label>
                                    <Input value={adminConfig.gemini_model || ""} onChange={(e) => setAdminConfig({ ...adminConfig, gemini_model: e.target.value })} className="font-mono bg-slate-50 focus-visible:ring-blue-500 h-10" />
                                </div>
                            </CardContent>
                            <CardFooter className="bg-slate-50/50 border-t justify-end p-4">
                                <Button onClick={() => handleSaveMultipleConfig({ gemini_api_key: adminConfig.gemini_api_key, gemini_model: adminConfig.gemini_model })} className="bg-blue-600 hover:bg-blue-700 font-bold gap-2 shadow-sm">
                                    <Save className="w-4 h-4" /> 정보 저장
                                </Button>
                            </CardFooter>
                        </Card>

                        <Card className="border-emerald-200 shadow-sm bg-white">
                            <CardHeader className="bg-emerald-50/50 border-b border-emerald-100"><CardTitle className="text-lg text-emerald-900 font-extrabold flex items-center gap-2">OpenAI ChatGPT API</CardTitle></CardHeader>
                            <CardContent className="pt-6 space-y-5">
                                <div className="space-y-2">
                                    <Label className="font-bold text-[13px] text-emerald-900">API Key 인증 토큰</Label>
                                    <Input type="password" value={adminConfig.openai_api_key || ""} onChange={(e) => setAdminConfig({ ...adminConfig, openai_api_key: e.target.value })} className="font-mono bg-slate-50 focus-visible:ring-emerald-500 h-10" />
                                </div>
                                <div className="space-y-2">
                                    <Label className="font-bold text-[13px] text-emerald-900">활성화된 API 모델명</Label>
                                    <Input value={adminConfig.openai_model || ""} onChange={(e) => setAdminConfig({ ...adminConfig, openai_model: e.target.value })} className="font-mono bg-slate-50 focus-visible:ring-emerald-500 h-10" />
                                </div>
                            </CardContent>
                            <CardFooter className="bg-slate-50/50 border-t justify-end p-4">
                                <Button onClick={() => handleSaveMultipleConfig({ openai_api_key: adminConfig.openai_api_key, openai_model: adminConfig.openai_model })} className="bg-emerald-600 hover:bg-emerald-700 font-bold gap-2 shadow-sm">
                                    <Save className="w-4 h-4" /> 정보 저장
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            )}
        </div>
    )
}
