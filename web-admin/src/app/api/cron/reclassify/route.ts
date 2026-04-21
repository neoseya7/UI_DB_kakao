export const maxDuration = 300; // 5 minutes (Pro plan)

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 주기적으로 재분류가 필요한 chat_logs를 재처리
// 대상: 최근 24h, category='UNKNOWN', retry_count<3
//   (a) classification IS NULL — collect-bulk의 maxDuration 초과/AI 타임아웃
//   (b) classification LIKE '%재고초과주문%' — 재고 회복 시 주문관리 자동 반영
//   (c) classification LIKE '%상품미등록%' — 상품 등록 시 주문관리 자동 반영

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) {
            throw new Error('Missing Supabase Environment Variables');
        }
        const supabase = createClient(supabaseUrl, serviceKey);

        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        // collect-bulk가 아직 AI 처리 중인 건을 선점하지 않도록 10분 레이스 버퍼
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

        const { data: targets, error: fetchErr } = await supabase
            .from('chat_logs')
            .select('id, store_id, nickname, chat_content, chat_time, collect_date, retry_count')
            .or('classification.is.null,classification.ilike.%재고초과주문%,classification.ilike.%상품미등록%')
            .eq('category', 'UNKNOWN')
            .lt('retry_count', 3)
            .gte('created_at', twentyFourHoursAgo)
            .lt('created_at', tenMinutesAgo)
            .order('created_at', { ascending: true })
            .limit(20);

        if (fetchErr) throw new Error(`Fetch Error: ${fetchErr.message}`);
        if (!targets || targets.length === 0) {
            return NextResponse.json({ success: true, processed: 0, message: 'No null-classified logs in window' });
        }

        // 매장별 그룹화 (매장당 config/products 1회만 fetch)
        const byStore = new Map<string, any[]>();
        for (const t of targets) {
            if (!byStore.has(t.store_id)) byStore.set(t.store_id, []);
            byStore.get(t.store_id)!.push(t);
        }

        const { data: config } = await supabase.from('super_admin_config').select('*').eq('id', 1).single();

        const geminiKey = config?.gemini_api_key;
        const geminiKeyBackup = config?.gemini_api_key_backup;
        const geminiModel = config?.gemini_model || 'gemini-1.5-flash';
        const openaiKey = config?.openai_api_key;
        const openaiKeyBackup = config?.openai_api_key_backup;
        const openaiModel = config?.openai_model || 'gpt-4o-mini';

        let promptA = "Output UNKNOWN";
        let promptB = "Output []";
        if (config?.prompt_set_1) {
            const parsed = typeof config.prompt_set_1 === 'string' ? JSON.parse(config.prompt_set_1) : config.prompt_set_1;
            promptA = parsed.gemini_a || promptA;
            promptB = parsed.gemini_b || promptB;
            if (promptA.includes('"""')) {
                promptA = promptA.split('"""').slice(1).join('"""').trim();
            }
        }
        promptA += "\n\n[CRITICAL SYSTEM FORMATTING RULE]: If a user orders multiple different products in one message (e.g. '수박1 사과2' or '수박(1) 사과(2)'), YOU MUST NEVER COMBINE THEM INTO A SINGLE JSON OBJECT! You MUST explicitly separate them into an array of multiple JSON objects. Example output ALWAYS: [{\"product\": \"수박\", \"quantity\": 1}, {\"product\": \"사과\", \"quantity\": 2}]. Do NOT return {\"product\": \"수박 1 사과 2\"}!!";

        const logAiError = async (storeId: string, provider: string, errorMessage: string, fallbackUsed: boolean, fallbackProvider: string | null) => {
            try {
                await supabase.from('ai_error_logs').insert({
                    provider,
                    error_message: errorMessage.slice(0, 500),
                    fallback_used: fallbackUsed,
                    fallback_provider: fallbackProvider,
                    store_id: storeId
                });
            } catch { /* silent */ }
        };

        const callGeminiWithKey = async (sysPrompt: string, userText: string, apiKey: string, jsonMode: boolean = false) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
            const generationConfig: any = { temperature: 0 };
            if (jsonMode) generationConfig.responseMimeType = "application/json";
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: sysPrompt }] },
                    contents: [{ parts: [{ text: userText }] }],
                    generationConfig,
                })
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
            }
            const json = await res.json();
            return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
        };

        const callOpenAIWithKey = async (sysPrompt: string, userText: string, apiKey: string, jsonMode: boolean = false) => {
            const body: any = {
                model: openaiModel,
                messages: [
                    { role: 'system', content: sysPrompt },
                    { role: 'user', content: userText }
                ],
                temperature: 0.1
            };
            if (jsonMode) body.response_format = { type: "json_object" };
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200)}`);
            }
            const json = await res.json();
            return json.choices?.[0]?.message?.content || "";
        };

        const callAIWithFallback = async (storeId: string, sysPrompt: string, userText: string, jsonMode: boolean = false): Promise<string> => {
            const providers: { name: string; fn: () => Promise<string> }[] = [];
            if (geminiKey) providers.push({ name: 'gemini', fn: () => callGeminiWithKey(sysPrompt, userText, geminiKey, jsonMode) });
            if (geminiKeyBackup) providers.push({ name: 'gemini-backup', fn: () => callGeminiWithKey(sysPrompt, userText, geminiKeyBackup, jsonMode) });
            if (openaiKey) providers.push({ name: 'openai', fn: () => callOpenAIWithKey(sysPrompt, userText, openaiKey) });
            if (openaiKeyBackup) providers.push({ name: 'openai-backup', fn: () => callOpenAIWithKey(sysPrompt, userText, openaiKeyBackup) });

            for (let i = 0; i < providers.length; i++) {
                try {
                    return await providers[i].fn();
                } catch (err: any) {
                    const isLast = i === providers.length - 1;
                    const fallbackProvider = isLast ? null : providers[i + 1]?.name;
                    await logAiError(storeId, providers[i].name, err.message, !isLast, fallbackProvider);
                    if (isLast) throw err;
                }
            }
            throw new Error('No AI providers configured');
        };

        const matchProductWithAI = async (storeId: string, userProductName: string, productCandidates: any[]) => {
            if (!productCandidates || productCandidates.length === 0) return userProductName;
            const exactMatch = productCandidates.find(p => p.collect_name === userProductName);
            if (exactMatch) return userProductName;

            const productListStr = productCandidates.map(p => p.collect_name).join(", ");
            const systemPromptText = promptB !== "Output []" ? promptB : `
#CONTEXT#
- 'user_product_name'은 사용자가 입력한 상품명입니다.
- 'product_list'는 시스템에 등록된 실제 상품 목록입니다.
- 'user_product_name'과 가장 유사한 상품을 하나 찾아 정확한 상품명으로 반환해 주세요.
- 없다면 'user_product_name' 그대로 반환. 출력은 상품명 하나만.
#INPUT#
- product_list: [{product_list}]
#OUTPUT#
`;
            const systemPrompt = systemPromptText.replace('{product_list}', productListStr);
            const userPrompt = `user_product_name: "${userProductName}"`;
            let result = await callAIWithFallback(storeId, systemPrompt, userPrompt);
            result = result.replace(/```json/gi, "").replace(/```/g, "").trim();
            if (result.includes("user_product_name:")) result = result.split("user_product_name:")[1].trim();
            if (result.includes("Input:")) result = result.split("Input:")[1].trim();
            const cleanResult = result.replace(/['"\n]/g, "").trim();
            if (productCandidates.find(p => p.collect_name === cleanResult)) return cleanResult;
            return userProductName;
        };

        let processed = 0;
        let errors = 0;

        for (const [storeId, rows] of byStore.entries()) {
            const [{ data: settings }, { data: productsRaw }] = await Promise.all([
                supabase.from('store_settings').select('crm_tags').eq('store_id', storeId).single(),
                supabase.from('products').select('id, collect_name, allocated_stock, target_date, is_regular_sale').eq('store_id', storeId).eq('is_hidden', false)
            ]);

            const productIds = productsRaw?.map(p => p.id) || [];
            let qtyMap: Record<string, number> = {};
            if (productIds.length > 0) {
                const { data: rpcData } = await supabase.rpc('get_product_sales_sum', {
                    p_store_id: storeId,
                    p_product_ids: productIds
                });
                if (rpcData) {
                    for (const item of rpcData) {
                        qtyMap[item.product_id] = parseInt(item.total_quantity, 10) || 0;
                    }
                }
            }

            const products = productsRaw?.map(p => ({
                ...p,
                collect_name: p.collect_name ? p.collect_name.trim() : "",
                remaining_stock: p.allocated_stock !== null ? Math.max(0, p.allocated_stock - (qtyMap[p.id] || 0)) : null
            })) || [];

            for (const row of rows) {
                const logId = row.id;
                const nextRetry = (row.retry_count || 0) + 1;
                const isFinalAttempt = nextRetry >= 3;

                try {
                    const { nickname, chat_content } = row;
                    if (!chat_content) {
                        await supabase.from('chat_logs').update({ retry_count: nextRetry }).eq('id', logId);
                        continue;
                    }

                    // 형제 row 체크: 같은 (store, date, time, content) 중 is_processed=true가 있으면
                    // 이 대화는 이미 처리된 건이므로 재수집 파생 row는 전면 skip.
                    // (product_name 매치는 하지 않음 — 9시간 지난 재수집이 새 product로 주문 생성하는 것 방지)
                    const { data: siblings } = await supabase.from('chat_logs')
                        .select('id')
                        .eq('store_id', storeId)
                        .eq('collect_date', row.collect_date)
                        .eq('chat_time', row.chat_time)
                        .eq('chat_content', chat_content)
                        .eq('is_processed', true)
                        .neq('id', logId)
                        .limit(1);
                    if (siblings && siblings.length > 0) {
                        await supabase.from('chat_logs').update({
                            classification: '분류:중복(처리된 형제 존재)',
                            is_processed: false,
                            product_name: 'X',
                            retry_count: nextRetry
                        }).eq('id', logId);
                        processed++;
                        continue;
                    }

                    const extractedRaw = await callAIWithFallback(storeId, promptA, chat_content, true);
                    let jsonMatch = extractedRaw.match(/\[[\s\S]*\]/);
                    let extractedItems: any[] = [];
                    if (jsonMatch) {
                        try { extractedItems = JSON.parse(jsonMatch[0]); } catch {}
                    } else {
                        const objMatch = extractedRaw.match(/\{[\s\S]*\}/);
                        if (objMatch) {
                            try { extractedItems = [JSON.parse(objMatch[0])]; } catch {}
                        }
                    }
                    if (extractedItems.length === 0) {
                        extractedItems = [{ category: "AI분석오류", product: "프롬프트 파싱 실패", quantity: "0" }];
                    }

                    // Bundled item splitter (collect-bulk와 동일)
                    const newItems: any[] = [];
                    for (const item of extractedItems) {
                        let combinedName = item.product || "";
                        combinedName = combinedName.replace(/\)\s+([^\s])/g, '), $1');
                        combinedName = combinedName.replace(/(\d)\s+([가-힣a-zA-Z])/g, '$1, $2');
                        if (combinedName.includes(",") || combinedName.includes("+") || combinedName.includes("&") || combinedName.includes("/")) {
                            const productsStr = combinedName.split(/[,+&/]/).map((s: string) => s.trim()).filter(Boolean);
                            const quantitiesStr = item.quantity ? item.quantity.toString().split(/[,+&/]/).map((s: string) => s.trim()) : ["1"];
                            for (let i = 0; i < productsStr.length; i++) {
                                let rawName = productsStr[i];
                                let itemQtyStr = quantitiesStr[i] || quantitiesStr[0] || "1";
                                const qtyMatch = rawName.match(/(.+?)(?:\((\d+)\))$/);
                                if (qtyMatch) {
                                    rawName = qtyMatch[1].trim();
                                    itemQtyStr = qtyMatch[2];
                                } else {
                                    const spaceNumMatch = rawName.match(/(.+?)\s*(\d{1,2})$/);
                                    if (spaceNumMatch) {
                                        rawName = spaceNumMatch[1].trim();
                                        itemQtyStr = spaceNumMatch[2];
                                    }
                                }
                                newItems.push({ ...item, product: rawName, quantity: itemQtyStr });
                            }
                        } else {
                            let rawName = combinedName;
                            let itemQtyStr = item.quantity ? item.quantity.toString() : "1";
                            const qtyMatch = rawName.match(/(.+?)(?:\((\d+)\))$/);
                            if (qtyMatch) {
                                rawName = qtyMatch[1].trim();
                                itemQtyStr = qtyMatch[2];
                            } else {
                                const spaceNumMatch = rawName.match(/(.+?)\s*(\d{1,2})$/);
                                if (spaceNumMatch) {
                                    rawName = spaceNumMatch[1].trim();
                                    itemQtyStr = spaceNumMatch[2];
                                }
                            }
                            newItems.push({ ...item, product: rawName, quantity: itemQtyStr });
                        }
                    }
                    extractedItems = newItems;

                    let promptCat = extractedItems[0]?.category || "기타";
                    if (["픽업고지", "상품후기", "기타", "문의", "픽업문의", "상품문의"].some(c => promptCat.includes(c))) {
                        extractedItems = [];
                    }
                    const isCancellationGlobal = promptCat.includes("취소") || promptCat === "주문취소";

                    let generalClassifications: string[] = [];
                    const crmMatches = settings?.crm_tags?.filter((t: any) => t.type === 'crm' && (chat_content.includes(t.name) || nickname.includes(t.name))) || [];
                    if (crmMatches.length > 0) generalClassifications.push(crmMatches[0].name);

                    if (extractedItems.length === 0) {
                        let classifications = [...generalClassifications, `분류:${promptCat}`];
                        const classificationStr = classifications.join(", ") || null;
                        const finalIntent = isCancellationGlobal ? "COMPLAINT" : promptCat === "픽업고지" ? "픽업고지" : promptCat.includes("문의") ? "INQUIRY" : "UNKNOWN";

                        await supabase.from('chat_logs').update({
                            is_processed: false,
                            product_name: "X",
                            category: finalIntent,
                            classification: classificationStr,
                            retry_count: nextRetry
                        }).eq('id', logId);
                    } else {
                        for (let i = 0; i < extractedItems.length; i++) {
                            const item = extractedItems[i];
                            let classifications = [...generalClassifications, `분류:${promptCat}`];
                            let isDuplicate = false;
                            let fixedProductName = item.product;

                            if (products) {
                                const availableCandidates = products.filter(p => p.allocated_stock === null || p.allocated_stock > 0);
                                fixedProductName = await matchProductWithAI(storeId, item.product, availableCandidates);
                                if (fixedProductName === item.product && !availableCandidates.find(p => p.collect_name === fixedProductName)) {
                                    const soldoutCandidates = products.filter(p => p.allocated_stock !== null && p.allocated_stock <= 0);
                                    if (soldoutCandidates.length > 0) {
                                        fixedProductName = await matchProductWithAI(storeId, item.product, soldoutCandidates);
                                    }
                                }
                                item.product = fixedProductName;

                                const qty = parseInt(item.quantity, 10) || 1;
                                const matchedProduct =
                                    products.find(p => p.collect_name === fixedProductName && (p.remaining_stock === null || p.remaining_stock >= qty))
                                    || products.find(p => p.collect_name === fixedProductName);

                                if (matchedProduct) {
                                    const isOutOfStock = matchedProduct.remaining_stock !== null && matchedProduct.remaining_stock < qty;
                                    if (!isOutOfStock && matchedProduct.remaining_stock !== null) {
                                        matchedProduct.remaining_stock -= qty;
                                    }
                                    item.finalDateStr = matchedProduct.is_regular_sale ? '1900-01-01' : matchedProduct.target_date;
                                    if (isOutOfStock) classifications.push("재고초과주문");

                                    const { data: existingOrders } = await supabase.from('orders')
                                        .select('id, order_items(product_id)')
                                        .eq('store_id', storeId)
                                        .eq('pickup_date', item.finalDateStr)
                                        .eq('customer_nickname', nickname);
                                    if (existingOrders && existingOrders.length > 0) {
                                        for (const eo of existingOrders) {
                                            if (eo.order_items.some((oi: any) => oi.product_id === matchedProduct.id)) {
                                                isDuplicate = true; break;
                                            }
                                        }
                                    }
                                    item.matchedProduct = matchedProduct;
                                } else {
                                    classifications.push("상품미등록");
                                }
                            } else {
                                classifications.push("상품미등록");
                            }

                            if (isDuplicate) classifications.push("중복주의");

                            const classificationStr = classifications.join(", ") || null;
                            const isCancellation = promptCat.includes("취소") || promptCat === "주문취소";
                            const isActualOrder = (promptCat === "픽업고지" || promptCat.includes("주문") || promptCat.includes("예약"))
                                && !isCancellation && !promptCat.includes("문의")
                                && !classifications.includes("재고초과주문")
                                && !classifications.includes("상품미등록");
                            const shouldSaveToOrders = isActualOrder || (isCancellation && !classifications.includes("상품미등록"));
                            const finalIntent = isActualOrder ? "ORDER" : (classifications.includes("재고초과주문") || classifications.includes("상품미등록")) ? "UNKNOWN" : isCancellation ? "COMPLAINT" : promptCat.includes("문의") ? "INQUIRY" : "UNKNOWN";

                            if (shouldSaveToOrders && item.matchedProduct) {
                                const targetDateStr = item.matchedProduct.is_regular_sale ? '1900-01-01' : item.matchedProduct.target_date;
                                if (targetDateStr) {
                                    const { data: orderData } = await supabase.from('orders').insert({
                                        store_id: storeId,
                                        pickup_date: targetDateStr,
                                        customer_nickname: nickname,
                                        is_received: false,
                                        is_hidden: false,
                                        customer_memo_1: isCancellation ? "자동 취소반영" : (isDuplicate ? "중복 접수됨" : "AI 수집(재분류)")
                                    }).select().single();

                                    if (orderData) {
                                        let itemQty = parseInt(item.quantity, 10) || 1;
                                        if (isCancellation) itemQty = -Math.abs(itemQty);
                                        const { error: itemError } = await supabase.from('order_items').insert({
                                            order_id: orderData.id,
                                            product_id: item.matchedProduct.id,
                                            quantity: itemQty
                                        });
                                        if (itemError) {
                                            await supabase.from('orders').delete().eq('id', orderData.id);
                                        }
                                    }
                                }
                            }

                            let q = parseInt(item.quantity, 10);
                            if (!isNaN(q) && q > 0 && isCancellation) q = -Math.abs(q);

                            if (i === 0) {
                                await supabase.from('chat_logs').update({
                                    is_processed: shouldSaveToOrders,
                                    product_name: fixedProductName,
                                    quantity: isNaN(q) ? null : q,
                                    category: finalIntent,
                                    classification: classificationStr,
                                    retry_count: nextRetry
                                }).eq('id', logId);
                            } else {
                                await supabase.from('chat_logs').insert({
                                    store_id: storeId,
                                    nickname,
                                    chat_content,
                                    chat_time: row.chat_time,
                                    collect_date: row.collect_date,
                                    category: finalIntent,
                                    is_processed: shouldSaveToOrders,
                                    product_name: fixedProductName,
                                    quantity: isNaN(q) ? null : q,
                                    classification: classificationStr
                                });
                            }
                        }
                    }
                    processed++;
                } catch (err: any) {
                    errors++;
                    console.error(`[Cron Reclassify] Error on log ${logId}:`, err?.message);
                    const updatePayload: any = { retry_count: nextRetry };
                    if (isFinalAttempt) {
                        updatePayload.classification = `분류:AI재시도실패 (${(err?.message || 'unknown').slice(0, 80)})`;
                        updatePayload.product_name = "X";
                    }
                    await supabase.from('chat_logs').update(updatePayload).eq('id', logId);
                }
            }
        }

        return NextResponse.json({
            success: true,
            processed,
            errors,
            total: targets.length
        });
    } catch (err: any) {
        console.error('[Cron Reclassify] Fatal Execution Error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
