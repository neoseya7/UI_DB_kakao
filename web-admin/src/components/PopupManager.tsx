"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabaseClient"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function PopupManager() {
    const [storeId, setStoreId] = useState<string | null>(null)
    
    // Popup states
    const [deadlineProducts, setDeadlineProducts] = useState<string[]>([])
    const [chatDelayed, setChatDelayed] = useState(false)
    const [lastChatTimeStr, setLastChatTimeStr] = useState("")

    // We keep track of products we ALREADY warned about in this session
    // so we don't annoy the user repeatedly if they dismiss it.
    const warnedProductIds = useRef<Set<string>>(new Set())

    // Refs for intervals and timeouts
    const chatIntervalRef = useRef<NodeJS.Timeout | null>(null)
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

    // Settings
    const settingsRef = useRef({
        deadline_enabled: false,
        chat_enabled: false,
        chat_threshold_min: 30
    })

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            setStoreId(user.id)

            // 1. Fetch settings
            const { data: sData } = await supabase.from('store_settings').select('popup_settings').eq('store_id', user.id).single()
            if (sData?.popup_settings) {
                settingsRef.current = {
                    deadline_enabled: sData.popup_settings.deadline_enabled ?? false,
                    chat_enabled: sData.popup_settings.chat_enabled ?? false,
                    chat_threshold_min: sData.popup_settings.chat_threshold_min ?? 30
                }
            }

            // Immediately check chat delay ONCE if enabled
            if (settingsRef.current.chat_enabled) {
                checkChatDelay(user.id)
            }
        }
        init()
    }, [])

    useEffect(() => {
        if (!storeId) return

        // 2. Chat check Every 10 mins
        if (chatIntervalRef.current) clearInterval(chatIntervalRef.current)
        chatIntervalRef.current = setInterval(() => {
            if (settingsRef.current.chat_enabled) {
                checkChatDelay(storeId)
            }
        }, 10 * 60 * 1000)

        // 3. Realtime listening for order_items if deadline alert is enabled
        let channel: any = null
        if (settingsRef.current.deadline_enabled) {
            channel = supabase.channel('order_items_realtime')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, (payload) => {
                    // Debounce the check so bulk inserts don't overwhelm the DB
                    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
                    debounceTimerRef.current = setTimeout(() => {
                        checkProductDeadlines(storeId)
                    }, 3000)
                })
                .subscribe()
        }

        return () => {
            if (chatIntervalRef.current) clearInterval(chatIntervalRef.current)
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
            if (channel) supabase.removeChannel(channel)
        }
    }, [storeId])

    const checkChatDelay = async (sId: string) => {
        try {
            // Find the most recent order created
            const { data, error } = await supabase.from('orders')
                .select('created_at')
                .eq('store_id', sId)
                .order('created_at', { ascending: false })
                .limit(1)
            
            if (error || !data || data.length === 0) return

            const lastDate = new Date(data[0].created_at)
            const now = new Date()
            const diffMs = now.getTime() - lastDate.getTime()
            const diffMinutes = Math.floor(diffMs / 60000)

            if (diffMinutes >= settingsRef.current.chat_threshold_min) {
                // Formatting time like "14:30"
                const hh = String(lastDate.getHours()).padStart(2, '0')
                const mm = String(lastDate.getMinutes()).padStart(2, '0')
                setLastChatTimeStr(`${hh}:${mm}`)
                setChatDelayed(true)
            }
        } catch (err) {
            console.error("PopupManager: Error checking chat delay", err)
        }
    }

    const checkProductDeadlines = async (sId: string) => {
        try {
            // 1. Fetch products that have allocated_stock
            const { data: products, error: pErr } = await supabase.from('products')
                .select('id, collect_name, display_name, allocated_stock, is_visible, is_hidden')
                .eq('store_id', sId)
                .eq('is_visible', true)
                .eq('is_hidden', false)
                .not('allocated_stock', 'is', null)
                
            if (pErr || !products || products.length === 0) return

            // 2. Fetch sales sum
            const pIds = products.map(p => p.id)
            const { data: rpcData, error: rpcErr } = await supabase.rpc('get_product_sales_sum', { 
                p_store_id: sId, 
                p_product_ids: pIds 
            })

            if (rpcErr) return

            const qtyMap: Record<string, number> = {}
            if (rpcData) {
                for (const item of rpcData) {
                    qtyMap[item.product_id] = parseInt(item.total_quantity, 10) || 0
                }
            }

            const newWarnings: string[] = []

            for (const p of products) {
                if (p.allocated_stock !== null && p.allocated_stock > 0) {
                    const orderedQty = qtyMap[p.id] || 0
                    const remaining = p.allocated_stock - orderedQty
                    
                    if (remaining <= 0 && !warnedProductIds.current.has(p.id)) {
                        newWarnings.push(p.collect_name || p.display_name || "알수없음")
                        warnedProductIds.current.add(p.id)
                    }
                }
            }

            if (newWarnings.length > 0) {
                setDeadlineProducts(prev => [...prev, ...newWarnings])
            }
        } catch (err) {
            console.error("PopupManager: Error checking product deadlines", err)
        }
    }

    const dismissChatDelay = () => {
        setChatDelayed(false)
        // Note: It will check again in 10 minutes and popup AGAIN if still delayed.
    }

    const dismissDeadline = () => {
        setDeadlineProducts([])
    }

    // Render nothing if no alert
    if (!chatDelayed && deadlineProducts.length === 0) return null

    return (
        <>
            {/* Deadline Alerts Modal */}
            <AlertDialog open={deadlineProducts.length > 0} onOpenChange={() => {}}>
                <AlertDialogContent className="border-red-600 border-2 bg-red-50">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-red-700 text-2xl flex items-center gap-2">
                            🚨 상품 마감 알림
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-red-900 font-medium text-lg pt-4">
                            다음 상품들의 잔여 수량이 <strong className="text-black">0</strong>이 되었습니다.<br/><br/>
                            <ul className="list-disc pl-5 mt-2 space-y-1">
                                {deadlineProducts.map((name, i) => (
                                    <li key={i}><strong className="text-red-700">[{name}]</strong> 상품 마감되었습니다.</li>
                                ))}
                            </ul>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-6">
                        <AlertDialogAction onClick={dismissDeadline} className="bg-red-600 hover:bg-red-700 text-white font-bold px-8">
                            확인했습니다
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Chat Delay Alert Modal */}
            <AlertDialog open={chatDelayed} onOpenChange={() => {}}>
                <AlertDialogContent className="border-amber-500 border-2 bg-amber-50">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-amber-700 text-2xl flex items-center gap-2">
                            ⚠️ 수집 지연 경고
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-amber-900 font-medium text-lg pt-4 leading-relaxed">
                            오늘의 대화 수집 봇이 응답하지 않고 있을 수 있습니다.<br/>
                            마지막 수집 시간: <strong>{lastChatTimeStr}</strong><br/>
                            설정하신 알림 기준 ({settingsRef.current.chat_threshold_min}분)을 초과했습니다.<br/><br/>
                            <strong className="text-black bg-amber-200 px-1">"대화를 확인해주세요"</strong>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-6">
                        <AlertDialogAction onClick={dismissChatDelay} className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-8">
                            확인했습니다
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
