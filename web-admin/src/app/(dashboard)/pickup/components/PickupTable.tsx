"use client"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { GuideBadge } from "@/components/ui/guide-badge"
import type { PickupViewProps } from "./types"

export default function PickupTable(props: PickupViewProps) {
    const {
        products, displayProducts, activeProductIndices, filteredCustomers, rawCustomers,
        isLoading, isMerged, isDeleteMode, selectedDeleteIds,
        posSyncEnabled, selectedPosOrders,
        editingQty, tempQty, editingMemo,
        isAddingRow, addRowNick, addRowQtys,
        toggleCheck, toggleDeleteSelect, togglePosSelect, togglePosSelectAll,
        handleUpdateQuantity, handleUpdateMemo, handleUpdateProductField,
        handleDeleteOrder, handleAddRowSave, getDisplaySummary, calculateItemPrice,
        setEditingQty, setTempQty, setEditingMemo,
        setIsAddingRow, setAddRowNick, setAddRowQtys,
        getStickyClasses: getStickyClassesProp
    } = props

    const getStickyClasses = getStickyClassesProp!

    return (
        <Card className="overflow-hidden border-border/60 shadow-md bg-card">
            <div className="overflow-x-auto overflow-y-auto w-full" style={{ maxHeight: "calc(100vh - 240px)" }}>
                <table className="w-full text-sm text-center border-collapse min-w-max relative">
                    <thead className="bg-muted/90 sticky top-0 z-30 shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
                        <tr>
                            <th rowSpan={6} className={`border-b border-r p-3 whitespace-nowrap text-xs sm:text-sm ${getStickyClasses('name').th}`}>
                                <div className="flex items-center gap-2 font-semibold">
                                    {posSyncEnabled && (
                                        <Checkbox
                                            disabled={isMerged || filteredCustomers.filter(c => !c.checked).length === 0}
                                            checked={selectedPosOrders.length > 0 && selectedPosOrders.length === filteredCustomers.filter(c => !c.checked && c.id).length}
                                            onCheckedChange={togglePosSelectAll}
                                            className="h-4 w-4 shrink-0 border-indigo-300 data-[state=checked]:bg-indigo-600 cursor-pointer disabled:opacity-30"
                                            title="전체 결제 선택"
                                        />
                                    )}
                                    <span>고객 닉네임</span>
                                </div>
                            </th>
                            <th rowSpan={6} className={`border-b border-r px-1 sm:px-2 py-3 whitespace-nowrap align-bottom pb-4 text-[11px] sm:text-sm tracking-tighter sm:tracking-normal cursor-help ${getStickyClasses('receive').th}`} title="수령확인">수령</th>
                            {isDeleteMode && <th rowSpan={6} className={`border-b border-r px-2 py-3 whitespace-nowrap align-bottom pb-4 ${getStickyClasses('delete').th}`}><span className="text-rose-600 font-bold">삭제</span></th>}
                            <th rowSpan={6} className={`border-b border-r px-2 py-0 align-bottom pb-4 ${getStickyClasses('summary').th}`}>
                                <div className="flex flex-col h-full items-center justify-end pb-0 gap-2">
                                    <div className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 bg-slate-50/80 px-2 py-1.5 rounded w-full min-w-[70px] border shadow-sm ring-1 ring-slate-900/5 mt-2">
                                        <div className="text-slate-800 font-bold border-b border-slate-200 pb-0.5 mb-0.5 tracking-tight">총 {filteredCustomers.length}건</div>
                                        <div className="text-emerald-700 font-semibold tracking-tight">수령: {filteredCustomers.filter(c => c.checked).length}</div>
                                        <div className="text-rose-600 font-semibold tracking-tight">미수령: {filteredCustomers.filter(c => !c.checked).length}</div>
                                    </div>
                                    <span className="text-sm font-bold text-slate-800">주문 상품 요약</span>
                                </div>
                            </th>
                            <th rowSpan={2} className={`border-b border-r px-3 py-3 align-bottom pb-4 text-center ${getStickyClasses('price').th}`}>결제 금액</th>
                            <th rowSpan={2} className={`border-b border-r p-0 align-bottom bg-indigo-100/95 ${getStickyClasses('memo').th}`}>
                                <GuideBadge text="고객이 수령일 변경을 원할 경우 고객찜에 입력을 하면 남은+미체크에 숫자가 변경이 되요." className="w-full h-full p-2 pb-4">
                                    <div className="flex flex-col items-center justify-end h-full gap-1 font-bold text-indigo-900 leading-none">
                                        <span>고객 비고 1</span>
                                        <span className="text-[11px] text-indigo-700/80">(고객찜)</span>
                                    </div>
                                </GuideBadge>
                            </th>
                            {displayProducts.map((p, i) => <th key={p.id || i} className="border-b border-r p-1 bg-amber-50/80 font-normal"><Input key={`memo-${p.id}`} defaultValue={p.product_memo} onBlur={(e) => handleUpdateProductField(p.id, 'product_memo', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} placeholder="상품 비고 1" className="h-7 text-xs text-center border-transparent bg-transparent focus:bg-white focus:border-amber-300 transition-colors" /></th>)}
                        </tr>
                        <tr>
                            {displayProducts.map((p, i) => (
                                <th key={p.id || i} className="border-b border-r p-3 min-w-[140px] max-w-[400px] font-bold text-[15px] whitespace-nowrap bg-muted/80 resize-x overflow-x-auto overflow-y-hidden">
                                    <div className="flex flex-col items-center justify-center gap-0.5">
                                        <span>{p.name}</span>
                                    </div>
                                    <div className="flex items-center justify-center gap-1 mt-1.5">
                                        <Input type="number" defaultValue={p.price} onBlur={(e) => handleUpdateProductField(p.id, 'price', e.target.value)} className="h-6 w-[70px] text-[12px] font-mono text-center px-1 py-0 border-slate-300 bg-white shadow-sm" title="가격을 수정하고 바깥을 클릭하면 저장됩니다" />
                                        <span className="text-[12px] text-muted-foreground font-normal">원</span>
                                    </div>
                                </th>
                            ))}
                        </tr>
                        <tr>
                            <th className={`border-b border-r py-2 px-1 text-[13px] font-bold text-blue-900 bg-white ${getStickyClasses('price').th}`}>
                                {displayProducts.reduce((acc, p) => acc + Number(p.stock || 0), 0).toLocaleString()}
                            </th>
                            <th className={`border-b border-r py-2 px-1 text-[12px] font-bold text-blue-900 tracking-tight bg-blue-100/95 ${getStickyClasses('memo').th}`}>발주수량</th>
                            {displayProducts.map((p, di) => (
                                <th key={p.id || di} className="border-b border-r py-2 px-1 bg-blue-50/40 text-[13px] font-semibold text-blue-800">
                                    <Input type="number" defaultValue={p.stock} onBlur={(e) => handleUpdateProductField(p.id, 'allocated_stock', e.target.value)} className="h-6 w-[50px] text-[13px] font-bold text-center px-1 py-0 mx-auto border-blue-200 bg-white text-blue-800 shadow-sm" title="수량을 수정하고 바깥을 클릭하면 저장됩니다" />
                                </th>
                            ))}
                        </tr>
                        <tr>
                            <th className={`border-b border-r py-2 px-1 text-[13px] font-bold text-slate-800 bg-white ${getStickyClasses('price').th}`}>
                                {activeProductIndices.reduce((acc, oi) => acc + rawCustomers.reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0), 0).toLocaleString()}
                            </th>
                            <th className={`border-b border-r py-2 px-1 text-[12px] font-bold text-slate-800 tracking-tight bg-slate-200/95 ${getStickyClasses('memo').th}`}>합계수량</th>
                            {activeProductIndices.map((oi, di) => {
                                const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                return (
                                    <th key={di} className="border-b border-r py-2 px-1 bg-slate-50/80 text-[13px] font-semibold text-slate-700">
                                        {orderSum}
                                    </th>
                                )
                            })}
                        </tr>
                        <tr>
                            <th className={`border-b border-r py-2 px-1 text-[13px] font-bold text-amber-900 bg-white ${getStickyClasses('price').th}`}>
                                {activeProductIndices.reduce((acc, oi) => acc + (products[oi].stock - rawCustomers.reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0)), 0).toLocaleString()}
                            </th>
                            <th className={`border-b border-r py-2 px-1 text-[12px] font-bold text-amber-900 tracking-tight bg-amber-100/95 ${getStickyClasses('memo').th}`}>남은수량</th>
                            {activeProductIndices.map((oi, di) => {
                                const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                const remaining = products[oi].stock - orderSum;
                                return (
                                    <th key={di} className="border-b border-r py-2 px-1 bg-amber-50/40 text-[13px] font-bold text-amber-700">
                                        {remaining}
                                    </th>
                                )
                            })}
                        </tr>
                        <tr>
                            <th className={`border-b border-r py-2 px-1 text-[14px] font-extrabold text-emerald-900 bg-white ${getStickyClasses('price').th}`}>
                                {activeProductIndices.reduce((acc, oi) => {
                                    const orderSum = rawCustomers.reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0);
                                    const remaining = products[oi].stock - orderSum;
                                    const unreceivedSum = rawCustomers.filter(c => !c.checked && (!c.memo2 || c.memo2.trim() === '')).reduce((cAcc, c) => cAcc + (c.items[oi] || 0), 0);
                                    return acc + (remaining + unreceivedSum);
                                }, 0).toLocaleString()}
                            </th>
                            <th className={`border-b border-r py-2 px-1 text-[11px] font-bold text-emerald-900 tracking-tighter leading-tight bg-emerald-100/95 ${getStickyClasses('memo').th}`}>남은+미체크</th>
                            {activeProductIndices.map((oi, di) => {
                                const orderSum = rawCustomers.reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                const remaining = products[oi].stock - orderSum;
                                const unreceivedSum = rawCustomers.filter(c => !c.checked && (!c.memo2 || c.memo2.trim() === '')).reduce((acc, c) => acc + (c.items[oi] || 0), 0);
                                const physicalTarget = remaining + unreceivedSum;
                                return (
                                    <th key={di} className="border-b border-r py-2 px-1 bg-emerald-50/60 text-[14px] font-extrabold text-emerald-800 shadow-inner">
                                        {physicalTarget}
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>

                    <tbody>
                        <tr><td colSpan={displayProducts.length + (isDeleteMode ? 7 : 6)} className="h-2 bg-muted/10 border-b border-t border-t-slate-300"></td></tr>

                        {/* 행 추가 버튼 */}
                        {!isAddingRow && !isMerged && (
                            <tr>
                                <td colSpan={displayProducts.length + (isDeleteMode ? 7 : 6)}>
                                    <button onClick={() => setIsAddingRow(true)} className="w-full py-2 text-sm text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors font-medium border-b border-dashed border-slate-200">
                                        + 행 추가 (수기 주문 등록)
                                    </button>
                                </td>
                            </tr>
                        )}

                        {/* 인라인 행 추가 입력 */}
                        {isAddingRow && (
                            <tr className="bg-amber-50/80 border-2 border-amber-300">
                                <td className={`border-b border-r px-1 py-1 ${getStickyClasses('name').td}`}>
                                    <Input autoFocus value={addRowNick} onChange={e => setAddRowNick(e.target.value)} placeholder="닉네임" className="h-8 text-xs font-semibold bg-white border-amber-400 px-1 w-full" onKeyDown={e => { if (e.key === 'Escape') { setIsAddingRow(false); setAddRowNick(""); setAddRowQtys({}) }}} />
                                </td>
                                <td className={`border-b border-r px-1 py-1 ${getStickyClasses('receive').td}`}>
                                    <div className="flex gap-1 justify-center">
                                        <Button size="sm" onClick={handleAddRowSave} className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold">저장</Button>
                                        <Button size="sm" variant="ghost" onClick={() => { setIsAddingRow(false); setAddRowNick(""); setAddRowQtys({}) }} className="h-7 px-2 text-xs">취소</Button>
                                    </div>
                                </td>
                                {isDeleteMode && <td className="border-b border-r"></td>}
                                <td className={`border-b border-r px-2 py-1 ${getStickyClasses('summary').td}`}>
                                    <span className="text-xs text-amber-700 font-medium">
                                        {Object.entries(addRowQtys).filter(([,q]) => parseInt(q) > 0).map(([idx, q]) => `${products[parseInt(idx)]?.name || ''} ${q}`).join(', ') || '상품을 입력하세요'}
                                    </span>
                                </td>
                                <td className={`border-b border-r px-2 py-1 font-bold text-amber-800 ${getStickyClasses('price').td}`}>
                                    {Object.entries(addRowQtys).reduce((total, [idx, q]) => {
                                        const p = products[parseInt(idx)];
                                        return total + (p ? calculateItemPrice(p, parseInt(q) || 0) : 0);
                                    }, 0).toLocaleString()}원
                                </td>
                                <td className={`border-b border-r py-1 px-1 ${getStickyClasses('memo').td}`}></td>
                                {activeProductIndices.map((oi, di) => (
                                    <td key={di} className="border-b border-r px-1 py-1">
                                        <Input type="number" value={addRowQtys[oi] || ""} onChange={e => setAddRowQtys((prev: Record<number, string>) => ({...prev, [oi]: e.target.value}))} className="w-[50px] h-8 mx-auto text-center font-bold px-1 py-0 bg-white border-amber-300 text-amber-900" placeholder="-" onKeyDown={e => { if (e.key === 'Enter') handleAddRowSave() }} />
                                    </td>
                                ))}
                            </tr>
                        )}

                        {isLoading ? (
                            <tr><td colSpan={displayProducts.length + (isDeleteMode ? 7 : 6)} className="p-8 text-center text-muted-foreground animate-pulse">데이터베이스에서 실시간 상태를 불러오는 중입니다...</td></tr>
                        ) : filteredCustomers.length === 0 ? (
                            <tr><td colSpan={displayProducts.length + (isDeleteMode ? 7 : 6)} className="p-8 text-muted-foreground font-medium text-center">조회할 데이터가 없습니다. (해당 일자에 상품이나 주문이 없습니다)</td></tr>
                        ) : (
                            filteredCustomers.map((c, i) => (
                                <tr key={`${isMerged}-${c.id || i}`} className={`hover:bg-muted/40 transition-colors group ${c.checked ? 'bg-emerald-50/30 opacity-70' : 'bg-background'} ${selectedPosOrders.includes(c.id) ? 'bg-indigo-50/40' : ''}`}>
                                    <td className={`border-b border-r px-2 py-1 text-xs sm:text-sm font-semibold whitespace-nowrap ${getStickyClasses('name').td}`}>
                                        <div className="flex flex-col items-start gap-0.5">
                                            <div className="flex items-center gap-2">
                                                {posSyncEnabled && (
                                                    <Checkbox
                                                        disabled={c.checked || isMerged}
                                                        checked={selectedPosOrders.includes(c.id)}
                                                        onCheckedChange={() => togglePosSelect(c.id)}
                                                        className="h-4 w-4 shrink-0 border-indigo-300 data-[state=checked]:bg-indigo-600 cursor-pointer disabled:opacity-30"
                                                    />
                                                )}
                                                {c.checked ? <span className="line-through text-muted-foreground truncate max-w-[120px]">{c.name}</span> : <span className="truncate max-w-[120px]">{c.name}</span>}
                                            </div>
                                            {c.crm && (
                                                <Badge variant="outline" className={`font-medium whitespace-nowrap text-[10px] px-1.5 py-0 shadow-sm ${c.crm.category === '노쇼' ? 'border-red-200 text-red-700 bg-red-50' : c.crm.category === '단골' ? 'border-blue-200 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-700 bg-slate-50'}`} title={c.crm.memo || c.crm.category}>
                                                    {c.crm.category === '노쇼' ? '🔴 노쇼' : c.crm.category === '단골' ? '🔵 단골' : `⚪ ${c.crm.category}`}
                                                    {c.crm.memo ? ` : ${c.crm.memo}` : ''}
                                                </Badge>
                                            )}
                                        </div>
                                    </td>
                                    <td className={`border-b border-r px-1 sm:px-2 py-1 ${getStickyClasses('receive').td}`}>
                                        <div className="flex justify-center items-center h-full pt-1">
                                            <Checkbox
                                                checked={c.checked}
                                                onCheckedChange={() => toggleCheck(c.id, c.checked, c.name)}
                                                className="h-5 w-5 sm:h-6 sm:w-6 border-slate-300 data-[state=checked]:bg-emerald-500 rounded-sm cursor-pointer"
                                            />
                                        </div>
                                    </td>
                                    {isDeleteMode && (
                                        <td className={`border-b border-r px-1 py-1 ${getStickyClasses('delete').td}`}>
                                            <div className="flex justify-center items-center h-full">
                                                <Checkbox
                                                    checked={selectedDeleteIds.includes(c.id)}
                                                    onCheckedChange={() => toggleDeleteSelect(c.id)}
                                                    disabled={isMerged}
                                                    className="h-5 w-5 sm:h-6 sm:w-6 border-rose-300 data-[state=checked]:bg-rose-500 rounded-sm cursor-pointer disabled:opacity-50"
                                                />
                                            </div>
                                        </td>
                                    )}
                                    <td className={`border-b border-r px-2 py-1 ${getStickyClasses('summary').td}`}>
                                        <span className="text-xs sm:text-sm font-medium text-slate-800">{getDisplaySummary(c.items)}</span>
                                    </td>
                                    <td className={`border-b border-r px-2 py-1 font-bold text-blue-900 shadow-inner ${getStickyClasses('price').td}`}>
                                        {activeProductIndices.reduce((total, oi) => total + calculateItemPrice(products[oi], c.items[oi] || 0), 0).toLocaleString()}원
                                    </td>
                                    <td className={`border-b border-r py-1 px-1 bg-indigo-50/95 ${getStickyClasses('memo').td}`}>
                                        <div className="flex flex-col gap-1 w-full relative">
                                            {editingMemo?.orderId === c.id && editingMemo?.type === 'memo1' ? (
                                                <Input autoFocus defaultValue={c.memo1} onBlur={(e) => { handleUpdateMemo(c.id, 'customer_memo_1', e.target.value, c.name); setEditingMemo(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingMemo(null) }} placeholder="비고 1" className="h-7 text-xs bg-white border-primary px-1 text-center shadow-inner" />
                                            ) : (
                                                <div onClick={() => setEditingMemo({ orderId: c.id, type: 'memo1' })} className={`h-7 text-xs border rounded-sm px-1 flex items-center justify-center cursor-pointer truncate ${c.memo1 ? 'bg-red-50 border-red-300 text-red-700 font-semibold hover:bg-red-100' : 'bg-white/70 border-slate-200 hover:bg-white'}`} title="클릭하여 편집">
                                                    {c.memo1 || <span className="text-muted-foreground/50">비고 1</span>}
                                                </div>
                                            )}

                                            {editingMemo?.orderId === c.id && editingMemo?.type === 'memo2' ? (
                                                <Input autoFocus defaultValue={c.memo2} onBlur={(e) => { handleUpdateMemo(c.id, 'customer_memo_2', e.target.value, c.name); setEditingMemo(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditingMemo(null) }} placeholder="고객찜" className="h-7 text-xs bg-white border-primary px-1 text-center shadow-inner" />
                                            ) : (
                                                <div onClick={() => setEditingMemo({ orderId: c.id, type: 'memo2' })} className={`h-7 text-xs border rounded-sm px-1 flex items-center justify-center cursor-pointer truncate ${c.memo2 ? 'bg-red-50 border-red-300 text-red-700 font-semibold hover:bg-red-100' : 'bg-white/70 border-slate-200 hover:bg-white'}`} title="클릭하여 편집">
                                                    {c.memo2 || <span className="text-muted-foreground/50">고객찜</span>}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    {activeProductIndices.map((oi, di) => {
                                        const qty = c.items[oi] || 0;
                                        const isEditing = editingQty?.orderId === c.id && editingQty?.productIdx === oi;

                                        return (
                                            <td
                                                key={di}
                                                className={`border-b border-r px-2 py-1 text-base font-bold transition-colors cursor-pointer ${qty > 0 ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-slate-50'}`}
                                                onClick={() => {
                                                    if (!isEditing && !isMerged) {
                                                        setEditingQty({ orderId: c.id, productIdx: oi });
                                                        setTempQty(qty > 0 ? qty.toString() : "");
                                                    }
                                                }}
                                                title={isMerged ? "이름 합치기 모드에서는 개별 수량을 수정할 수 없습니다." : "클릭하여 수량 수정 (0 입력 시 삭제)"}
                                            >
                                                {isEditing ? (
                                                    <Input
                                                        type="number"
                                                        autoFocus
                                                        className="w-[50px] h-8 mx-auto text-center font-bold px-1 py-0 shadow-inner bg-white border-primary"
                                                        value={tempQty}
                                                        onChange={(e) => setTempQty(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleUpdateQuantity(c.id, oi, tempQty)
                                                            if (e.key === 'Escape') setEditingQty(null)
                                                        }}
                                                        onBlur={() => handleUpdateQuantity(c.id, oi, tempQty)}
                                                    />
                                                ) : (
                                                    qty > 0 ? <span className="text-primary">{qty}</span> : <span className="text-muted-foreground/20 font-normal">-</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}

                    </tbody>
                </table>
            </div>
        </Card>
    )
}
