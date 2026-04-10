"use client"

import { useEffect, useState, useRef } from "react"
import { AlertCircle, X } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

export function OrderDeadlineProvider({ children }: { children: React.ReactNode }) {
    const [showAlert, setShowAlert] = useState(false)
    const [alertData, setAlertData] = useState({ productName: "", minutesLeft: 0 })
    
    const [storeId, setStoreId] = useState<string | null>(null)
    const [settings, setSettings] = useState({ enabled: true, minutes: 5 })
    const [products, setProducts] = useState<any[]>([])
    
    // To prevent firing the same alert repeatedly
    const alertedKeys = useRef<Set<string>>(new Set())

    // 1. Initialize data and Realtime subscriptions
    useEffect(() => {
        let channel: any = null

        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            setStoreId(user.id)

            // Fetch Settings
            const { data: sData } = await supabase.from('store_settings').select('order_alert_enabled, alert_minutes_before').eq('store_id', user.id).single()
            if (sData) {
                setSettings({
                    enabled: sData.order_alert_enabled ?? true,
                    minutes: sData.alert_minutes_before ?? 5
                })
            }

            // Fetch Products
            const { data: pData } = await supabase.from('products').select('*').eq('store_id', user.id).not('deadline_time', 'is', null)
            if (pData) setProducts(pData)

            // Listen to real-time changes for settings & products
            channel = supabase.channel('deadline_tracker')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings', filter: `store_id=eq.${user.id}` }, (payload: any) => {
                    const newS = payload.new
                    setSettings({ enabled: newS.order_alert_enabled, minutes: newS.alert_minutes_before })
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `store_id=eq.${user.id}` }, async () => {
                    const { data } = await supabase.from('products').select('*').eq('store_id', user.id).not('deadline_time', 'is', null)
                    if (data) setProducts(data)
                })
                .subscribe()
        }
        init()

        return () => { if (channel) supabase.removeChannel(channel) }
    }, [])

    // 2. Poll every 10 seconds to check deadlines
    useEffect(() => {
        if (!settings.enabled || products.length === 0) return

        const interval = setInterval(() => {
            const now = new Date()

            products.forEach(p => {
                if (!p.deadline_date || !p.deadline_time) return

                // Construct full ISO string assuming KST (+09:00)
                const deadlineStr = `${p.deadline_date}T${p.deadline_time}+09:00`
                const deadline = new Date(deadlineStr)
                
                if (isNaN(deadline.getTime())) return

                // Calculate difference in exact minutes
                const diffMs = deadline.getTime() - now.getTime()
                const diffMins = Math.floor(diffMs / 60000)

                if (diffMins === settings.minutes && diffMins >= 0) {
                    const alertKey = `${p.id}_${p.deadline_date}_${p.deadline_time}`
                    
                    if (!alertedKeys.current.has(alertKey)) {
                        alertedKeys.current.add(alertKey)
                        setAlertData({ productName: p.display_name || p.collect_name, minutesLeft: diffMins })
                        setShowAlert(true)
                        
                        // Auto hide after 15 seconds
                        setTimeout(() => setShowAlert(false), 15000)
                    }
                }
            })
        }, 10000)

        return () => clearInterval(interval)
    }, [products, settings])

    // 3. User Mockup Trigger from Settings Check
    useEffect(() => {
        const handleSimulate = (e: any) => {
            setAlertData({
                productName: e.detail?.productName || "바닐라 마카롱 5구 특별 세트",
                minutesLeft: e.detail?.minutes || 5
            })
            setShowAlert(true)
            setTimeout(() => setShowAlert(false), 10000)
        }
        window.addEventListener("simulate-deadline-alert", handleSimulate)
        return () => window.removeEventListener("simulate-deadline-alert", handleSimulate)
    }, [])

    return (
        <>
            {children}
            {showAlert && (
                <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300">
                    <div className="bg-red-600 text-white p-5 rounded-xl shadow-2xl flex items-start gap-4 max-w-[400px] border border-red-400">
                        <AlertCircle className="w-7 h-7 shrink-0 mt-0.5 animate-pulse text-white drop-shadow-md" />
                        <div className="flex flex-col gap-1.5 pr-6 w-full">
                            <span className="font-extrabold text-xl leading-tight drop-shadow-sm">발주 마감 임박! 🚨</span>
                            <span className="font-medium text-red-50 opacity-95 leading-snug break-keep">
                                <strong className="text-white underline decoration-red-300 underline-offset-2 break-all">[{alertData.productName}]</strong> 상품의 발주 마감이 <strong className="text-yellow-300 text-xl mx-0.5 drop-shadow-sm">{alertData.minutesLeft}분</strong> 남았습니다.
                            </span>
                        </div>
                        <button
                            onClick={() => setShowAlert(false)}
                            className="absolute top-2 right-2 text-red-200 hover:text-white bg-red-700/50 hover:bg-red-500 rounded-full p-1 transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
