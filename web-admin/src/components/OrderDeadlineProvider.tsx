"use client"

import { useEffect, useState } from "react"
import { AlertCircle, X } from "lucide-react"

export function OrderDeadlineProvider({ children }: { children: React.ReactNode }) {
    const [showAlert, setShowAlert] = useState(false)
    const [alertData, setAlertData] = useState({ productName: "", minutesLeft: 0 })

    useEffect(() => {
        // Add a global listener for our mockup trigger
        const handleSimulate = (e: any) => {
            setAlertData({
                productName: e.detail?.productName || "바닐라 마카롱 5구 특별 세트",
                minutesLeft: e.detail?.minutes || 5
            })
            setShowAlert(true)

            // Auto hide after 10s
            const timer = setTimeout(() => {
                setShowAlert(false)
            }, 10000)
            return () => clearTimeout(timer)
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
                        <div className="flex flex-col gap-1.5 pr-6">
                            <span className="font-extrabold text-xl leading-tight drop-shadow-sm">발주 마감 임박! 🚨</span>
                            <span className="font-medium text-red-50 opacity-95 leading-snug">
                                <strong className="text-white underline decoration-red-300 underline-offset-2">[{alertData.productName}]</strong> 상품의 발주 마감이 <strong className="text-yellow-300 text-xl mx-0.5 drop-shadow-sm">{alertData.minutesLeft}분</strong> 남았습니다.
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
