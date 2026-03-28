"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, TrendingUp, DollarSign, CalendarDays, Download } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"
import { Button } from "@/components/ui/button"
import { format, startOfWeek, startOfMonth } from "date-fns"

export default function AnalyticsPage() {
    const [storeId, setStoreId] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [rawOrders, setRawOrders] = useState<any[]>([])
    const [timeRange, setTimeRange] = useState<"daily" | "weekly" | "monthly">("daily")
    const [startDate, setStartDate] = useState<string>("")
    const [endDate, setEndDate] = useState<string>("")
    const [metrics, setMetrics] = useState({
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0
    })
    const [chartData, setChartData] = useState<any[]>([])

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                setStoreId(user.id)
                fetchAnalytics(user.id)
            }
        })
    }, [])

    const fetchAnalytics = async (uid: string) => {
        setIsLoading(true)
        try {
            const { data: ordersData, error } = await supabase
                .from('orders')
                .select(`
                    id, 
                    pickup_date, 
                    is_received,
                    order_items (
                        quantity,
                        product_id,
                        products (
                            collect_name,
                            display_name,
                            price,
                            incoming_price
                        )
                    )
                `)
                .eq('store_id', uid)
                .not('pickup_date', 'is', null)

            if (error) throw error
            if (ordersData) setRawOrders(ordersData)

        } catch (err) {
            console.error("Failed to load analytics:", err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleDownloadExcel = () => {
        if (rawOrders.length === 0) {
            alert("다운로드할 데이터가 없습니다.")
            return
        }

        const filteredOrders = rawOrders.filter((order: any) => {
            const rawDate = order.pickup_date
            if (!rawDate) return false
            if (startDate && rawDate < startDate) return false
            if (endDate && rawDate > endDate) return false
            return true
        })

        // 일자, 상품명, 판매량, 매출액, 상품원가, 순이익
        const headers = ["일자", "상품명", "판매량", "매출액", "상품원가", "순이익"]
        let csvContent = "\uFEFF" + headers.join(",") + "\n"

        filteredOrders.forEach((order: any) => {
            const date = order.pickup_date || ""
            order.order_items?.forEach((item: any) => {
                const prodName = item.products?.display_name || item.products?.collect_name || "알수없음"
                const qty = item.quantity || 0
                const price = item.products?.price || 0
                const cost = item.products?.incoming_price || 0
                
                const revenue = qty * price
                const totalCost = qty * cost
                const profit = revenue - totalCost

                // Handle commas in product name
                const safeName = `"${prodName.replace(/"/g, '""')}"`

                csvContent += `${date},${safeName},${qty},${revenue},${totalCost},${profit}\n`
            })
        })

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `매출자료_${format(new Date(), "yyyyMMdd")}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    useEffect(() => {
        if (rawOrders.length === 0) return

        let rev = 0
        let cost = 0
        const dateMap = new Map<string, { revenue: number, cost: number, profit: number }>()

        // 1. Filter the entire raw JSON array against the Date bounds
        const filteredOrders = rawOrders.filter((order: any) => {
            const rawDate = order.pickup_date
            if (!rawDate) return false
            if (startDate && rawDate < startDate) return false
            if (endDate && rawDate > endDate) return false
            return true
        })

        filteredOrders.forEach((order: any) => {
            const rawDate = order.pickup_date

            let dateKey = rawDate
            try {
                const dateObj = new Date(rawDate)
                if (timeRange === "weekly") {
                    dateKey = format(startOfWeek(dateObj, { weekStartsOn: 1 }), "MM-dd") + " 주간"
                } else if (timeRange === "monthly") {
                    dateKey = format(startOfMonth(dateObj), "yyyy-MM")
                }
            } catch (e) { }

            if (!dateMap.has(dateKey)) {
                dateMap.set(dateKey, { revenue: 0, cost: 0, profit: 0 })
            }

            const mapItem = dateMap.get(dateKey)!

            order.order_items?.forEach((item: any) => {
                const qty = item.quantity || 0
                const p = item.products?.price || 0
                const c = item.products?.incoming_price || 0

                const itemRev = qty * p
                const itemCost = qty * c

                rev += itemRev
                cost += itemCost

                mapItem.revenue += itemRev
                mapItem.cost += itemCost
                mapItem.profit += (itemRev - itemCost)
            })
        })

        setMetrics({
            totalRevenue: rev,
            totalCost: cost,
            totalProfit: rev - cost
        })

        const sortedData = Array.from(dateMap.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, vals]) => ({
                date,
                "매출액(원)": vals.revenue,
                "원가액(원)": vals.cost,
                "순이익(원)": vals.profit
            }))

        setChartData(sortedData)
    }, [rawOrders, timeRange, startDate, endDate])

    return (
        <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto pb-10">
            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
                <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-bold tracking-tight">매출통계</h2>
                    <p className="text-muted-foreground">픽업 완료된 주문을 기준으로 매장 재무 실적을 요약합니다.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={handleDownloadExcel} variant="outline" size="sm" className="h-9 gap-1.5 shadow-sm text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 font-bold shrink-0">
                        <Download className="w-4 h-4" /> 엑셀 다운로드
                    </Button>
                    <div className="flex items-center gap-2 bg-muted/40 p-1.5 rounded-lg border shadow-sm shrink-0">
                    <Button
                        variant={timeRange === "daily" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTimeRange("daily")}
                        className={`text-sm h-8 px-4 ${timeRange === "daily" ? "shadow-sm" : ""}`}
                    >
                        일별
                    </Button>
                    <Button
                        variant={timeRange === "weekly" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTimeRange("weekly")}
                        className={`text-sm h-8 px-4 ${timeRange === "weekly" ? "shadow-sm" : ""}`}
                    >
                        주별
                    </Button>
                    <Button
                        variant={timeRange === "monthly" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTimeRange("monthly")}
                        className={`text-sm h-8 px-4 ${timeRange === "monthly" ? "shadow-sm" : ""}`}
                    >
                        월별
                    </Button>
                </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white p-3 border rounded-lg shadow-sm gap-4">
                <div className="flex items-center gap-3">
                    <CalendarDays className="h-5 w-5 text-indigo-500" />
                    <span className="font-semibold text-sm text-slate-700">조회 기간 설정</span>
                </div>
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-2 bg-slate-50/50 p-2 rounded-md border text-sm font-medium w-full sm:w-auto">
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-slate-600 flex-1 min-w-[130px]"
                    />
                    <span className="text-slate-400">~</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-slate-600 flex-1 min-w-[130px]"
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 md:h-7 px-3 md:px-2 w-full sm:w-auto mt-2 sm:mt-0 text-sm md:text-xs text-rose-500 hover:bg-rose-50 border border-slate-200 sm:border-transparent font-semibold shadow-sm sm:shadow-none bg-white sm:bg-transparent"
                        onClick={() => { setStartDate(""); setEndDate(""); }}
                    >
                        초기화
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="py-20 text-center text-muted-foreground animate-pulse font-medium">데이터베이스의 전 기간 주문을 집계 중입니다...</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="shadow-sm border-indigo-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-full -translate-y-10 translate-x-10 blur-xl"></div>
                            <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
                                <CardTitle className="text-sm font-semibold text-muted-foreground">누적 총 매출액</CardTitle>
                                <DollarSign className="w-4 h-4 text-indigo-500" />
                            </CardHeader>
                            <CardContent className="relative z-10">
                                <div className="text-2xl font-bold text-indigo-700">{metrics.totalRevenue.toLocaleString()}원</div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-rose-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50/50 rounded-full -translate-y-10 translate-x-10 blur-xl"></div>
                            <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
                                <CardTitle className="text-sm font-semibold text-muted-foreground">누적 총 원가액</CardTitle>
                                <BarChart3 className="w-4 h-4 text-rose-500" />
                            </CardHeader>
                            <CardContent className="relative z-10">
                                <div className="text-2xl font-bold text-rose-700">{metrics.totalCost.toLocaleString()}원</div>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-emerald-200 bg-emerald-50/30 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/50 rounded-full -translate-y-10 translate-x-10 blur-xl"></div>
                            <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
                                <CardTitle className="text-sm font-bold text-emerald-800">누적 총 순이익</CardTitle>
                                <TrendingUp className="w-4 h-4 text-emerald-600" />
                            </CardHeader>
                            <CardContent className="relative z-10">
                                <div className="text-3xl font-black text-emerald-600 tracking-tight">{metrics.totalProfit.toLocaleString()}원</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card className="shadow-sm border-slate-200">
                        <CardHeader className="pb-2">
                            <div className="flex items-center gap-2 text-slate-800">
                                <CalendarDays className="h-5 w-5 text-primary" />
                                <CardTitle className="text-lg">{timeRange === 'daily' ? '일별' : timeRange === 'weekly' ? '주별' : '월별'} 실적 추이</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px] w-full mt-4">
                                {chartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickMargin={10} />
                                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} tickFormatter={(value) => `${(value / 10000).toFixed(0)}만`} />
                                            <Tooltip
                                                cursor={{ fill: '#f3f4f6' }}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                                formatter={(value) => [Number(value).toLocaleString() + "원", ""]}
                                                labelStyle={{ fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}
                                            />
                                            <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
                                            <Bar dataKey="매출액(원)" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                            <Bar dataKey="원가액(원)" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                            <Bar dataKey="순이익(원)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg bg-slate-50/50">
                                        <BarChart3 className="h-10 w-10 text-slate-300 mb-3" />
                                        <p>표시할 수 있는 픽업/주문 데이터가 유효하지 않습니다.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    )
}
