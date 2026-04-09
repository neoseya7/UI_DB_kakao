"use client"

import { useState, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, ChevronUp, Minus, Plus, Trash2, X, PlusCircle } from "lucide-react"
import type { PickupViewProps, Product } from "./types"

interface PickupCardListProps extends PickupViewProps {
    // For order add bottom sheet
    currentDate: string
    manualOrderProducts: Product[]
    newNick: string
    newDate: string
    newProductId: string
    newQty: string
    setNewNick: (v: string) => void
    setNewDate: (v: string) => void
    setNewProductId: (v: string) => void
    setNewQty: (v: string) => void
    handleAddOrder: () => void
    // Search gate state
    searchScope?: string
    activeSearchTerm?: string
}

export default function PickupCardList(props: PickupCardListProps) {
    const {
        products, activeProductIndices, filteredCustomers, rawCustomers,
        isLoading, isMerged,
        toggleCheck, handleUpdateQuantity, handleUpdateMemo, handleDeleteOrder,
        getDisplaySummary, calculateItemPrice,
        currentDate, manualOrderProducts, newNick, newDate, newProductId, newQty,
        setNewNick, setNewDate, setNewProductId, setNewQty, handleAddOrder,
        searchScope, activeSearchTerm
    } = props

    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [summaryOpen, setSummaryOpen] = useState(false)
    const [addSheetOpen, setAddSheetOpen] = useState(false)
    const [editingField, setEditingField] = useState<{ orderId: string; field: 'memo1' | 'memo2' } | null>(null)

    // Summary data
    const summaryData = activeProductIndices.map(oi => {
        const p = products[oi]
        const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[oi] || 0), 0)
        const remaining = p.stock - orderSum
        return { name: p.name, stock: p.stock, orderSum, remaining }
    })

    return (
        <div className="flex flex-col gap-3 pb-20">
            {/* Summary Card */}
            <Card className="overflow-hidden border-border/60 shadow-sm">
                <button
                    onClick={() => setSummaryOpen(!summaryOpen)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">오늘 요약</span>
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            총 {filteredCustomers.length}건
                        </Badge>
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs px-1.5 py-0">
                            수령 {filteredCustomers.filter(c => c.checked).length}
                        </Badge>
                        <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100 text-xs px-1.5 py-0">
                            미수령 {filteredCustomers.filter(c => !c.checked).length}
                        </Badge>
                    </div>
                    {summaryOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {summaryOpen && (
                    <div className="px-4 py-3 border-t divide-y divide-slate-100">
                        {summaryData.map((item, i) => (
                            <div key={i} className="flex items-center justify-between py-2 text-sm">
                                <span className="font-semibold text-slate-700 truncate flex-1 mr-2">{item.name}</span>
                                <div className="flex items-center gap-3 text-xs shrink-0">
                                    <span className="text-blue-700 font-bold">발주 {item.stock}</span>
                                    <span className="text-slate-600">주문 {item.orderSum}</span>
                                    <span className={`font-bold ${item.remaining <= 0 ? 'text-red-600' : 'text-amber-700'}`}>
                                        잔여 {item.remaining}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Order Cards */}
            {isLoading ? (
                <div className="py-12 text-center text-muted-foreground animate-pulse text-sm">
                    데이터를 불러오는 중...
                </div>
            ) : filteredCustomers.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                    {searchScope === "all_dates" && !(activeSearchTerm || "").trim()
                        ? "닉네임 또는 상품명을 입력 후 엔터를 눌러주세요."
                        : "조회할 데이터가 없습니다."}
                </div>
            ) : (
                filteredCustomers.map((c, i) => {
                    const isExpanded = expandedId === (c.id || `idx-${i}`)
                    const cardKey = c.id || `idx-${i}`
                    const totalPrice = activeProductIndices.reduce(
                        (total, oi) => total + calculateItemPrice(products[oi], c.items[oi] || 0), 0
                    )
                    // Find which product this order has
                    const orderProductIndex = activeProductIndices.find(oi => (c.items[oi] || 0) > 0)
                    const orderProduct = orderProductIndex !== undefined ? products[orderProductIndex] : null
                    const orderQty = orderProductIndex !== undefined ? (c.items[orderProductIndex] || 0) : 0

                    return (
                        <Card
                            key={`${isMerged}-${cardKey}`}
                            className={`overflow-hidden border transition-all ${c.checked ? 'bg-emerald-50/30 opacity-70 border-emerald-200' : 'bg-white border-slate-200'}`}
                        >
                            {/* Collapsed view */}
                            <div
                                className="px-4 py-3 flex items-center gap-3 cursor-pointer active:bg-slate-50"
                                onClick={() => setExpandedId(isExpanded ? null : cardKey)}
                            >
                                <Checkbox
                                    checked={c.checked}
                                    onCheckedChange={(e) => {
                                        e; // prevent event propagation issue
                                        toggleCheck(c.id, c.checked, c.name)
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-6 w-6 border-slate-300 data-[state=checked]:bg-emerald-500 rounded-sm cursor-pointer shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-bold text-sm truncate ${c.checked ? 'line-through text-muted-foreground' : 'text-slate-800'}`}>
                                            {c.name}
                                        </span>
                                        {c.crm && (
                                            <Badge variant="outline" className={`text-[10px] px-1 py-0 shrink-0 ${c.crm.category === '노쇼' ? 'border-red-200 text-red-700 bg-red-50' : c.crm.category === '단골' ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-700 bg-slate-50'}`}>
                                                {c.crm.category === '노쇼' ? '🔴 노쇼' : c.crm.category === '단골' ? '🔵 단골' : c.crm.category}
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 truncate mt-0.5">
                                        {getDisplaySummary(c.items)}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="text-sm font-bold text-blue-900">{totalPrice.toLocaleString()}원</span>
                                </div>
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                            </div>

                            {/* Expanded view */}
                            {isExpanded && (
                                <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50/50">
                                    {/* Product quantity stepper(s) */}
                                    {activeProductIndices.map(oi => {
                                        const qty = c.items[oi] || 0
                                        if (qty <= 0) return null
                                        const p = products[oi]
                                        return (
                                            <div key={oi} className="flex items-center justify-between">
                                                <span className="text-sm font-semibold text-slate-700 truncate flex-1 mr-3">{p.name}</span>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 w-8 p-0 border-slate-300"
                                                        disabled={isMerged}
                                                        onClick={() => {
                                                            if (qty > 1) handleUpdateQuantity(c.id, oi, String(qty - 1))
                                                            else if (qty === 1) handleUpdateQuantity(c.id, oi, "0")
                                                        }}
                                                    >
                                                        <Minus className="w-4 h-4" />
                                                    </Button>
                                                    <Input
                                                        type="number"
                                                        defaultValue={qty}
                                                        key={`${c.id}-${oi}-${qty}`}
                                                        onBlur={(e) => handleUpdateQuantity(c.id, oi, e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                                        disabled={isMerged}
                                                        className="w-12 h-8 text-center font-bold text-sm px-1 border-slate-300"
                                                        inputMode="numeric"
                                                    />
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 w-8 p-0 border-slate-300"
                                                        disabled={isMerged}
                                                        onClick={() => handleUpdateQuantity(c.id, oi, String(qty + 1))}
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* Memo fields */}
                                    <div className="space-y-2 pt-1">
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-500 mb-0.5 block">비고 1</label>
                                            {editingField?.orderId === c.id && editingField?.field === 'memo1' ? (
                                                <Input
                                                    autoFocus
                                                    defaultValue={c.memo1}
                                                    onBlur={(e) => {
                                                        handleUpdateMemo(c.id, 'customer_memo_1', e.target.value, c.name)
                                                        setEditingField(null)
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') e.currentTarget.blur()
                                                        if (e.key === 'Escape') setEditingField(null)
                                                    }}
                                                    className="h-8 text-sm bg-white"
                                                    placeholder="비고 입력..."
                                                />
                                            ) : (
                                                <div
                                                    onClick={() => setEditingField({ orderId: c.id, field: 'memo1' })}
                                                    className={`h-8 text-sm border rounded-md px-2 flex items-center cursor-pointer ${c.memo1 ? 'bg-red-50 border-red-200 text-red-700 font-medium' : 'bg-white border-slate-200 text-slate-400'}`}
                                                >
                                                    {c.memo1 || '탭하여 입력...'}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-semibold text-slate-500 mb-0.5 block">고객찜</label>
                                            {editingField?.orderId === c.id && editingField?.field === 'memo2' ? (
                                                <Input
                                                    autoFocus
                                                    defaultValue={c.memo2}
                                                    onBlur={(e) => {
                                                        handleUpdateMemo(c.id, 'customer_memo_2', e.target.value, c.name)
                                                        setEditingField(null)
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') e.currentTarget.blur()
                                                        if (e.key === 'Escape') setEditingField(null)
                                                    }}
                                                    className="h-8 text-sm bg-white"
                                                    placeholder="고객찜 입력..."
                                                />
                                            ) : (
                                                <div
                                                    onClick={() => setEditingField({ orderId: c.id, field: 'memo2' })}
                                                    className={`h-8 text-sm border rounded-md px-2 flex items-center cursor-pointer ${c.memo2 ? 'bg-red-50 border-red-200 text-red-700 font-medium' : 'bg-white border-slate-200 text-slate-400'}`}
                                                >
                                                    {c.memo2 || '탭하여 입력...'}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Delete button */}
                                    {!isMerged && (
                                        <div className="pt-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full h-9 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-semibold gap-1.5"
                                                onClick={() => handleDeleteOrder(c.id, c.name)}
                                            >
                                                <Trash2 className="w-4 h-4" /> 삭제
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>
                    )
                })
            )}

            {/* FAB - Add Order */}
            <button
                onClick={() => setAddSheetOpen(true)}
                className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
            >
                <PlusCircle className="w-7 h-7" />
            </button>

            {/* Bottom Sheet - Add Order */}
            {addSheetOpen && (
                <>
                    <div
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                        onClick={() => setAddSheetOpen(false)}
                    />
                    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl border-t border-slate-200 animate-in slide-in-from-bottom duration-300 max-h-[80vh] overflow-y-auto">
                        <div className="px-5 py-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-slate-800">주문 등록</h3>
                                <button
                                    onClick={() => setAddSheetOpen(false)}
                                    className="p-1 rounded-full hover:bg-slate-100"
                                >
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm font-semibold text-slate-700 mb-1 block">날짜</label>
                                    <Input
                                        type="date"
                                        value={newDate || currentDate}
                                        onChange={e => setNewDate(e.target.value)}
                                        className="h-11 bg-white font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-700 mb-1 block">닉네임</label>
                                    <Input
                                        placeholder="고객 닉네임 입력"
                                        value={newNick}
                                        onChange={e => setNewNick(e.target.value)}
                                        className="h-11 bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-700 mb-1 block">상품 선택</label>
                                    <Select value={newProductId} onValueChange={setNewProductId}>
                                        <SelectTrigger className="h-11 bg-white">
                                            <SelectValue placeholder="상품을 선택하세요" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {manualOrderProducts
                                                .sort((a, b) => {
                                                    const active = newDate || currentDate;
                                                    const aIsTarget = a.target_date === active;
                                                    const bIsTarget = b.target_date === active;
                                                    if (aIsTarget && !bIsTarget) return -1;
                                                    if (!aIsTarget && bIsTarget) return 1;
                                                    return a.name.localeCompare(b.name, 'ko-KR');
                                                })
                                                .map((p) => {
                                                    const active = newDate || currentDate;
                                                    const isTarget = p.target_date === active;
                                                    const label = isTarget ? `[해당일] ${p.name}` : `[상시] ${p.name}`;
                                                    return <SelectItem key={p.id} value={p.id}>{label}</SelectItem>
                                                })}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="text-sm font-semibold text-slate-700 mb-1 block">수량</label>
                                    <Input
                                        type="number"
                                        placeholder="수량 입력"
                                        value={newQty}
                                        onChange={e => setNewQty(e.target.value)}
                                        className="h-11 bg-white font-bold text-lg"
                                        inputMode="numeric"
                                        min="1"
                                    />
                                </div>

                                <Button
                                    onClick={() => {
                                        handleAddOrder()
                                        setAddSheetOpen(false)
                                    }}
                                    className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-sm"
                                >
                                    등록하기
                                </Button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
