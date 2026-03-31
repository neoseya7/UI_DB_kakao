export const maxDuration = 120; // 2 minutes max per bulk execution

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { messages } = payload

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ success: true, message: 'No messages to process', success_hashes: [] })
        }

        const firstMsg = messages[0]
        const store_id = firstMsg.store_id

        if (!store_id) {
            return NextResponse.json({ success: false, error: 'Missing store_id in payload' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            return NextResponse.json({ success: false, error: 'Server misconfiguration: Service Role Key missing' }, { status: 500 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabase = createClient(supabaseUrl, serviceKey)

        // 1. Fetch Configs & CRM Tags & Products ONCE for the entire batch
        const [{ data: config }, { data: settings }, { data: productsRaw }] = await Promise.all([
            supabase.from('super_admin_config').select('*').eq('id', 1).single(),
            supabase.from('store_settings').select('crm_tags').eq('store_id', store_id).single(),
            supabase.from('products').select('id, collect_name, allocated_stock, target_date').eq('store_id', store_id).eq('is_hidden', false)
        ])

        const productIds = productsRaw?.map(p => p.id) || [];
        let qtyMap: Record<string, number> = {};
        if (productIds.length > 0) {
            const { data: rpcData, error: rpcErr } = await supabase.rpc('get_product_sales_sum', {
                p_store_id: store_id,
                p_product_ids: productIds
            });

            if (rpcData && !rpcErr) {
                for (const item of rpcData) {
                    qtyMap[item.product_id] = parseInt(item.total_quantity, 10) || 0;
                }
            } else {
                console.error("RPC Error:", rpcErr);
            }
        }

        const products = productsRaw?.map(p => ({
            ...p,
            collect_name: p.collect_name ? p.collect_name.trim() : "",
            remaining_stock: p.allocated_stock !== null ? Math.max(0, p.allocated_stock - (qtyMap[p.id] || 0)) : null
        })) || []

        const managerNicks = settings?.crm_tags?.filter((t: any) => t.type === 'manager').map((t: any) => t.name) || []

        const geminiKey = config?.gemini_api_key
        const geminiModel = config?.gemini_model || 'gemini-1.5-flash'

        let promptA = "Output UNKNOWN"
        let promptB = "Output []"

        if (config?.prompt_set_1) {
            const parsed = typeof config.prompt_set_1 === 'string' ? JSON.parse(config.prompt_set_1) : config.prompt_set_1
            promptA = parsed.gemini_a || promptA
            promptB = parsed.gemini_b || promptB
            if (promptA.includes('"""')) {
                promptA = promptA.split('"""').slice(1).join('"""').trim();
            }
        }

        // --- NEW: CRITICAL SYSTEM OVERRIDE FOR MULTI-ITEM BUNDLING ---
        // Dynamically enforce multi-object JSON splitting at the Prompt layer to prevent Gemini from omitting delimiters or grouping items.
        promptA += "\n\n[CRITICAL SYSTEM FORMATTING RULE]: If a user orders multiple different products in one message (e.g. '수박1 사과2' or '수박(1) 사과(2)'), YOU MUST NEVER COMBINE THEM INTO A SINGLE JSON OBJECT! You MUST explicitly separate them into an array of multiple JSON objects. Example output ALWAYS: [{\"product\": \"수박\", \"quantity\": 1}, {\"product\": \"사과\", \"quantity\": 2}]. Do NOT return {\"product\": \"수박 1 사과 2\"}!!";

        const callGemini = async (sysPrompt: string, userText: string) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: sysPrompt }] },
                    contents: [{ parts: [{ text: userText }] }]
                })
            })
            if (!res.ok) {
                const errText = await res.text()
                throw new Error(`Gemini API Error: ${res.status} - ${errText}`)
            }
            const json = await res.json()
            return json.candidates?.[0]?.content?.parts?.[0]?.text || ""
        }

        const matchProductWithAI = async (userProductName: string, productCandidates: any[]) => {
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
            let result = await callGemini(systemPrompt, userPrompt);
            result = result.replace(/```json/gi, "").replace(/```/g, "").trim();
            if (result.includes("user_product_name:")) result = result.split("user_product_name:")[1].trim();
            if (result.includes("Input:")) result = result.split("Input:")[1].trim();
            const cleanResult = result.replace(/['"\n]/g, "").trim();

            if (productCandidates.find(p => p.collect_name === cleanResult)) {
                return cleanResult;
            }

            return userProductName;
        }

        const success_hashes: string[] = []

        // Process sequentially to be safe against Gemini rate limits
        for (const msg of messages) {
            try {
                const { hash, nickname, chat_content, chat_time, collect_date } = msg

                if (!chat_content) continue

                let parsedTime = chat_time
                if (typeof chat_time === 'string') {
                    const timeMatch = chat_time.match(/(오전|오후)\s*(\d{1,2}):(\d{2})/)
                    if (timeMatch) {
                        const isAfternoon = timeMatch[1] === '오후'
                        let hours = parseInt(timeMatch[2], 10)
                        const minutes = timeMatch[3]
                        if (isAfternoon && hours < 12) hours += 12
                        if (!isAfternoon && hours === 12) hours = 0
                        parsedTime = `${hours.toString().padStart(2, '0')}:${minutes}:00`
                    } else {
                        const simpleMatch = chat_time.match(/(\d{1,2}):(\d{2})/)
                        if (simpleMatch) parsedTime = `${simpleMatch[1].padStart(2, '0')}:${simpleMatch[2]}:00`
                    }
                }
                if (!parsedTime || parsedTime.trim() === "") parsedTime = "00:00:00"

                const isSystem = !nickname || nickname === "System" || nickname === "시스템" || nickname === "카카오톡" || nickname === "알림톡" || nickname === "알수없음"
                const isManager = managerNicks.includes(nickname)

                if (isSystem || isManager) {
                    success_hashes.push(hash)
                    continue
                }

                // Initial chat log insert
                const { data: logData, error: logError } = await supabase.from('chat_logs').insert({
                    store_id, nickname, chat_content, chat_time: parsedTime, collect_date, category: 'UNKNOWN'
                }).select().single()

                if (logError) throw new Error("Log Insert Fail: " + logError.message)
                const logId = logData.id

                if (!geminiKey) {
                    success_hashes.push(hash)
                    continue
                }

                // AI Intent Analysis
                const extractedRaw = await callGemini(promptA, chat_content)
                let jsonMatch = extractedRaw.match(/\[[\s\S]*\]/)
                let extractedItems: any[] = []

                if (jsonMatch) {
                    try { extractedItems = JSON.parse(jsonMatch[0]) } catch (e) {}
                } else {
                    const objMatch = extractedRaw.match(/\{[\s\S]*\}/)
                    if (objMatch) {
                        try { extractedItems = [JSON.parse(objMatch[0])] } catch (e) {}
                    }
                }

                if (extractedItems.length === 0) {
                    extractedItems = [{ category: "AI분석오류", product: "프롬프트 파싱 실패", quantity: "0" }]
                }
                
                // NEW: Gemini Flash Safety Net - Force split bundled items mimicking GPT's proper behavior
                if (extractedItems.length > 0) {
                    const newItems: any[] = [];
                    for (const item of extractedItems) {
                        let combinedName = item.product || "";
                        // Catch parenthesis spacing (e.g. "가브리살(1) 항정살(1)" -> "가브리살(1), 항정살(1)")
                        combinedName = combinedName.replace(/\)\s+([^\s])/g, '), $1');
                        // Catch number spacing (e.g. "삼겹살 2 목살 2" -> "삼겹살 2, 목살 2")
                        combinedName = combinedName.replace(/(\d)\s+([가-힣a-zA-Z])/g, '$1, $2');
                        
                        if (combinedName.includes(",") || combinedName.includes("+") || combinedName.includes("&") || combinedName.includes("/")) {
                            // Split by all common delimiters
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
                                    // Match single/double digit trailing quantities preceded by space or attached
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
                }

                const firstItem = extractedItems[0]
                let promptCat = firstItem?.category || "기타";

                let classifications: string[] = [`분류:${promptCat}`]
                const crmMatches = settings?.crm_tags?.filter((t: any) => t.type === 'crm' && (chat_content.includes(t.name) || nickname.includes(t.name))) || []
                if (crmMatches.length > 0) classifications.push(crmMatches[0].name)

                let isDuplicate = false

                if (extractedItems.length > 0 && products) {
                    for (const item of extractedItems) {
                        let fixedProductName = item.product;
                        const availableCandidates = products.filter(p => p.allocated_stock === null || p.allocated_stock > 0);
                        fixedProductName = await matchProductWithAI(item.product, availableCandidates);

                        if (fixedProductName === item.product && !availableCandidates.find(p => p.collect_name === fixedProductName)) {
                            const soldoutCandidates = products.filter(p => p.allocated_stock !== null && p.allocated_stock <= 0);
                            if (soldoutCandidates.length > 0) {
                                fixedProductName = await matchProductWithAI(item.product, soldoutCandidates);
                            }
                        }

                        item.product = fixedProductName;
                        const matchedProduct = products.find(p => p.collect_name === fixedProductName);

                        if (matchedProduct) {
                            const qty = parseInt(item.quantity, 10) || 1
                            const isOutOfStock = matchedProduct.remaining_stock !== null && matchedProduct.remaining_stock < qty;

                            if (!isOutOfStock && matchedProduct.remaining_stock !== null) {
                                matchedProduct.remaining_stock -= qty;
                            }

                            if (!firstItem.pickup_date || firstItem.pickup_date === "날짜미지정" || firstItem.pickup_date.trim() === "") {
                                if (matchedProduct.target_date) firstItem.pickup_date = matchedProduct.target_date;
                                else if (!isOutOfStock && !classifications.includes("날짜미지정")) classifications.push("날짜미지정");
                            }

                            if (isOutOfStock && !classifications.includes("재고초과주문")) classifications.push("재고초과주문")

                            if (!isDuplicate) {
                                const { data: existingOrders } = await supabase.from('orders')
                                    .select('id, order_items(product_id)')
                                    .eq('store_id', store_id)
                                    .eq('pickup_date', collect_date)
                                    .eq('customer_nickname', nickname)
                                
                                if (existingOrders && existingOrders.length > 0) {
                                    for (const eo of existingOrders) {
                                        if (eo.order_items.some((oi: any) => oi.product_id === matchedProduct.id)) {
                                            isDuplicate = true; break;
                                        }
                                    }
                                }
                            }
                        } else {
                            if (!classifications.includes("상품미등록")) classifications.push("상품미등록");
                        }
                    }
                } else if (extractedItems.length > 0 && !products) {
                    if (!firstItem.pickup_date || firstItem.pickup_date === "날짜미지정" || firstItem.pickup_date.trim() === "") classifications.push("날짜미지정");
                }

                // Verify ALL items exist in products database before allowing insertion
                if (extractedItems.length > 0 && products) {
                    for (const item of extractedItems) {
                        if (!products.find(p => p.collect_name === item.product)) {
                            if (!classifications.includes("상품미등록")) classifications.push("상품미등록");
                        }
                    }
                }

                if (isDuplicate) classifications.push("중복주의")

                const isCancellation = promptCat.includes("취소") || promptCat === "주문취소";

                const isActualOrder = (promptCat === "픽업고지" || promptCat.includes("주문") || promptCat.includes("예약"))
                    && !isCancellation && !promptCat.includes("문의")
                    && !classifications.includes("재고초과주문")
                    && !classifications.includes("상품미등록");

                const shouldSaveToOrders = isActualOrder || (isCancellation && !classifications.includes("상품미등록"));

                const finalIntent = isActualOrder ? "ORDER" : (classifications.includes("재고초과주문") || classifications.includes("상품미등록")) ? "UNKNOWN" : isCancellation ? "COMPLAINT" : promptCat.includes("문의") ? "INQUIRY" : "UNKNOWN";
                await supabase.from('chat_logs').update({ category: finalIntent }).eq('id', logId)

                // Save to Orders DB
                if (extractedItems.length > 0 && shouldSaveToOrders) {
                    let finalDateStr = collect_date
                    if (firstItem.pickup_date && firstItem.pickup_date !== "날짜미지정") {
                        if (firstItem.pickup_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            finalDateStr = firstItem.pickup_date;
                        } else {
                            const year = collect_date.split('-')[0]
                            const mmdd = firstItem.pickup_date.replace('/', '-')
                            if (mmdd.match(/^\d{1,2}-\d{1,2}$/)) {
                                const parts = mmdd.split('-')
                                finalDateStr = `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
                            }
                        }
                    }

                    const targetDate = new Date(finalDateStr)
                    const { data: orderData } = await supabase.from('orders').insert({
                        store_id,
                        pickup_date: targetDate.toISOString().split('T')[0],
                        customer_nickname: nickname,
                        is_received: false,
                        customer_memo_1: isCancellation ? "자동 취소반영" : (isDuplicate ? "중복 접수됨" : "AI 수집")
                    }).select().single()

                    if (orderData) {
                        for (const item of extractedItems) {
                            const matchedProduct = products?.find(p => p.collect_name === item.product)
                            if (matchedProduct) {
                                let itemQty = parseInt(item.quantity, 10) || 1
                                if (isCancellation) itemQty = -Math.abs(itemQty)

                                await supabase.from('order_items').insert({
                                    order_id: orderData.id,
                                    product_id: matchedProduct.id,
                                    quantity: itemQty
                                })
                            }
                        }
                    }
                }

                const classificationStr = classifications.join(", ") || null;

                if (extractedItems.length === 0) {
                    await supabase.from('chat_logs').update({
                        is_processed: shouldSaveToOrders,
                        product_name: "-",
                        classification: classificationStr
                    }).eq('id', logId);
                } else {
                    for (let i = 0; i < extractedItems.length; i++) {
                        const item = extractedItems[i];
                        let q = parseInt(item.quantity, 10);
                        if (!isNaN(q) && q > 0 && isCancellation) q = -Math.abs(q);
                        
                        const pName = item.product;

                        if (i === 0) {
                            await supabase.from('chat_logs').update({
                                is_processed: shouldSaveToOrders,
                                product_name: pName,
                                quantity: isNaN(q) ? null : q,
                                classification: classificationStr
                            }).eq('id', logId);
                        } else {
                            await supabase.from('chat_logs').insert({
                                store_id,
                                nickname,
                                chat_content,
                                chat_time: parsedTime,
                                collect_date,
                                category: finalIntent,
                                is_processed: shouldSaveToOrders,
                                product_name: pName,
                                quantity: isNaN(q) ? null : q,
                                classification: classificationStr
                            });
                        }
                    }
                }

                // ONLY IF EVERYTHING SUCCEEDS safely push to success hashes
                success_hashes.push(hash)

            } catch (err) {
                console.error("Bulk processing error for a message:", err)
                // Skip success_hashes push on error, so python scraper will re-send this specific msg later!
            }
        }

        return NextResponse.json({
            success: true,
            message: `Bulk processing completed. Successfully processed ${success_hashes.length} out of ${messages.length} messages.`,
            success_hashes: success_hashes
        })

    } catch (e: any) {
        console.error("API collect-bulk route error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
