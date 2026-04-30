import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeMsgHash } from '@/lib/msgHash'
import { STRICT_MATCHING_APPENDIX } from '@/lib/promptAppendix'

export async function POST(request: Request) {
    try {
        const payload = await request.json()
        const { store_id, nickname, chat_content, chat_time, collect_date } = payload

        if (!store_id || !chat_content) {
            return NextResponse.json({ success: false, error: 'Missing required parameters' }, { status: 400 })
        }

        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            return NextResponse.json({ success: false, error: 'Server misconfiguration: Service Role Key missing' }, { status: 500 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabase = createClient(supabaseUrl, serviceKey)

        // Parse Korean time format ("오전/오후 HH:MM") to SQL format ("HH:MM:SS")
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

        if (!parsedTime || parsedTime.trim() === "") {
            parsedTime = "00:00:00"
        }

        // 1. Fetch Configs & CRM Tags & Products First
        const [{ data: config }, { data: settings }, { data: productsRaw }] = await Promise.all([
            supabase.from('super_admin_config').select('*').eq('id', 1).single(),
            supabase.from('store_settings').select('crm_tags').eq('store_id', store_id).single(),
            supabase.from('products').select('id, collect_name, allocated_stock, target_date, is_regular_sale').eq('store_id', store_id).eq('is_hidden', false)
        ])

        // Prepare products without stock-sales calculation (RPC deferred until we know it's an order message)
        // remaining_stock initialized to allocated_stock — preserves legacy RPC-failure semantics
        const products: any[] = productsRaw?.map((p: any) => ({
            ...p,
            collect_name: p.collect_name ? p.collect_name.trim() : "",
            remaining_stock: p.allocated_stock !== null ? p.allocated_stock : null
        })) || []
        const productIds = productsRaw?.map((p: any) => p.id) || [];

        // 2. Filter out Manager and System messages to save AI tokens & DB space
        const managerNicks = settings?.crm_tags?.filter((t: any) => t.type === 'manager').map((t: any) => t.name) || []
        const isSystem = !nickname || nickname === "System" || nickname === "시스템" || nickname === "카카오톡" || nickname === "알림톡" || nickname === "알수없음"
        
        const normalizeNick = (n: string) => n ? n.toString().normalize('NFC').replace(/[\[\]\s\u200B\u200C\u200D\uFEFF]/g, '').replace(/\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu, '') : ''
        const cleanNickname = normalizeNick(nickname)
        const isManager = managerNicks.some((n: string) => normalizeNick(n) === cleanNickname)

        if (isSystem || isManager) {
            console.log(`[collect] Skipping manager/system: "${nickname}" (store: ${store_id})`)
            return NextResponse.json({ success: true, message: 'Message ignored (System or Manager)' })
        }

        // Server-side hash (1차 dedup용. 클라이언트 hash 의존 제거)
        const msgHash = computeMsgHash(store_id, nickname || '', parsedTime, chat_content)

        // 3. Save Raw Log immediately (safe fallback)
        const { data: logData, error: logError } = await supabase.from('chat_logs').insert({
            store_id, nickname, chat_content, chat_time: parsedTime, collect_date, category: 'UNKNOWN', msg_hash: msgHash
        }).select().single()

        if (logError) throw new Error("Failed to insert chat_log: " + logError.message)
        const logId = logData.id

        if (!config || !config.gemini_api_key) {
            return NextResponse.json({ success: true, message: 'Message logged, but AI not configured.' })
        }

        const geminiKey = config.gemini_api_key
        const geminiModel = config.gemini_model || 'gemini-1.5-flash'

        let promptA = "Output UNKNOWN"
        let promptB = "Output []"

        if (config.prompt_set_1) {
            const parsed = typeof config.prompt_set_1 === 'string' ? JSON.parse(config.prompt_set_1) : config.prompt_set_1
            promptA = parsed.gemini_a || promptA
            promptB = parsed.gemini_b || promptB

            // 🔥 CRITICAL FIX: Strip the erroneous English prefix added by the previous agent
            if (promptA.includes('"""')) {
                promptA = promptA.split('"""').slice(1).join('"""').trim();
            }
        }
        
        // --- NEW: CRITICAL SYSTEM OVERRIDE FOR MULTI-ITEM BUNDLING ---
        promptA += "\n\n[CRITICAL SYSTEM FORMATTING RULE]: If a user orders multiple different products in one message (e.g. '수박1 사과2' or '수박(1) 사과(2)'), YOU MUST NEVER COMBINE THEM INTO A SINGLE JSON OBJECT! You MUST explicitly separate them into an array of multiple JSON objects. Example output ALWAYS: [{\"product\": \"수박\", \"quantity\": 1}, {\"product\": \"사과\", \"quantity\": 2}]. Do NOT return {\"product\": \"수박 1 사과 2\"}!!";

        // KST 기준 오늘 날짜 (Vercel UTC 환경에서도 한국 자정 기준으로 계산)
        const todayKST = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
        // KST 기준 오늘 - 3일 (늦주문 허용 윈도우)
        const cutoffKST = new Date(Date.now() - 3 * 24 * 3600 * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })

        // 매칭 후보 필터: 상시판매 포함 + 과거 3일 이내 ~ 미래 target_date 허용
        const isMatchableProduct = (p: any) =>
            p.is_regular_sale || (p.target_date && p.target_date >= cutoffKST)

        // 같은 이름 상품 여러 row 중 우선순위 결정용:
        //   1순위 미래/오늘 (가까운 순), 2순위 과거 3일 이내 (최근 순), 3순위 상시판매
        const getMatchRank = (p: any) => {
            if (p.is_regular_sale) return 3
            if (p.target_date && p.target_date >= todayKST) return 1
            return 2
        }
        const sortByMatchPriority = (arr: any[]) => arr.slice().sort((a: any, b: any) => {
            const ra = getMatchRank(a), rb = getMatchRank(b)
            if (ra !== rb) return ra - rb
            if (ra === 1) return (a.target_date || '').localeCompare(b.target_date || '')  // 미래: 가까운 순
            if (ra === 2) return (b.target_date || '').localeCompare(a.target_date || '')  // 과거: 최근 순
            return 0
        })

        // --- NEW: PRODUCT VARIANT AWARENESS ---
        // Inject registered product names so AI can distinguish variants from quantities
        // (날짜 필터 적용 — 어제·과거 상품은 주입 X)
        const productNameList = products.filter(isMatchableProduct).map(p => p.collect_name).filter(Boolean);
        if (productNameList.length > 0) {
            promptA += `\n\n[REGISTERED PRODUCT LIST]: The store has these products: [${productNameList.join(', ')}]. IMPORTANT: When a number follows a product name (e.g. '석류즙30', '석류즙 60'), check if it matches a registered product variant (e.g. '석류즙(30포)', '석류즙(60포)'). If so, the number is a VARIANT IDENTIFIER, NOT a quantity. Output the matched product name exactly as registered with quantity 1. Example: '석류즙30' → {"product": "석류즙(30포)", "quantity": 1}, NOT {"product": "석류즙", "quantity": 30}.`;
        }

        const callGemini = async (sysPrompt: string, userText: string, jsonMode: boolean = false) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`
            const generationConfig: any = { temperature: 0 }
            if (jsonMode) {
                generationConfig.responseMimeType = "application/json"
            }
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: sysPrompt }] },
                    contents: [{ parts: [{ text: userText }] }],
                    generationConfig,
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
            // Fallback to the user's customized Prompt B (Typo correction), or default to inline.
            const systemPromptText = promptB !== "Output []" ? promptB : `
#CONTEXT#
- 'user_product_name'은 사용자가 입력한 상품명입니다.
- 'product_list'는 시스템에 등록된 실제 상품 목록입니다.
- 'user_product_name'과 가장 유사한 상품을 'product_list'에서 하나만 찾아 정확한 상품명으로 반환해 주세요.
- 만약 유사한 상품이 없다면, 'user_product_name'을 그대로 반환해 주세요.
- 출력은 반드시 상품명 하나만 포함해야 합니다. 다른 설명은 절대 추가하지 마세요.
#INPUT#
- product_list: [{product_list}]
#OUTPUT#
`;
            const systemPrompt = systemPromptText.replace('{product_list}', productListStr) + STRICT_MATCHING_APPENDIX;
            const userPrompt = `user_product_name: "${userProductName}"`;
            let result = await callGemini(systemPrompt, userPrompt);
            // Clean up Markdown and prefixes
            result = result.replace(/```json/gi, "").replace(/```/g, "").trim();
            if (result.includes("user_product_name:")) result = result.split("user_product_name:")[1].trim();
            if (result.includes("Input:")) result = result.split("Input:")[1].trim();
            const cleanResult = result.replace(/['"\n]/g, "").trim();

            // Validation: Ensure cleanResult exists and shares at least 2 chars with input
            if (productCandidates.find(p => p.collect_name === cleanResult)) {
                const set1 = new Set(userProductName.replace(/\s/g, "").split(''));
                const set2 = new Set(cleanResult.replace(/\s/g, "").split(''));
                const intersection = new Set([...set1].filter(x => set2.has(x)));
                if (intersection.size >= 2) return cleanResult;
            }
            return userProductName;
        }

        // 3. Step 1: Execute Full AI Analysis (Intent & Output JSON) using Prompt A
        const extractedRaw = await callGemini(promptA, chat_content, true)

        console.log("---- DEBUG LOGS ----")
        console.log("Extracted Raw output:", extractedRaw)

        let jsonMatch = extractedRaw.match(/\[[\s\S]*\]/)
        let extractedItems: any[] = []

        if (jsonMatch) {
            try { extractedItems = JSON.parse(jsonMatch[0]) } catch (e) { console.error("Array Parse error", e) }
        } else {
            // Fallback to single object if Gemini missed the brackets
            const objMatch = extractedRaw.match(/\{[\s\S]*\}/)
            if (objMatch) {
                try { extractedItems = [JSON.parse(objMatch[0])] } catch (e) { console.error("Object Parse error", e) }
            }
        }
        
        // --- NEW: ADVANCED REGEX BUNDLE SHREDDER ---
        // Helper: check if a name (or variant with parentheses) matches a registered product
        const productNameSet = new Set(products.map(p => p.collect_name));
        const matchesRegisteredProduct = (name: string) => {
            if (productNameSet.has(name)) return true;
            // Try common variant patterns: "석류즙30" → "석류즙(30포)", "석류즙(30)"
            const numSuffix = name.match(/(.+?)(\d+)$/);
            if (numSuffix) {
                const base = numSuffix[1].trim();
                const num = numSuffix[2];
                if (productNameSet.has(`${base}(${num}포)`)) return true;
                if (productNameSet.has(`${base}(${num}개)`)) return true;
                if (productNameSet.has(`${base}(${num})`)) return true;
                if (productNameSet.has(`${base} ${num}포`)) return true;
                if (productNameSet.has(`${base}${num}포`)) return true;
            }
            return false;
        };

        if (extractedItems.length > 0) {
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

                        // Skip number stripping if the name matches a registered product variant
                        if (!matchesRegisteredProduct(rawName)) {
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
                        }
                        newItems.push({ ...item, product: rawName, quantity: itemQtyStr });
                    }
                } else {
                    let rawName = combinedName;
                    let itemQtyStr = item.quantity ? item.quantity.toString() : "1";

                    // Skip number stripping if the name matches a registered product variant
                    if (!matchesRegisteredProduct(rawName)) {
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
                    }
                    newItems.push({ ...item, product: rawName, quantity: itemQtyStr });
                }
            }
            extractedItems = newItems;
        }

        if (extractedItems.length === 0) {
            extractedItems = [{ category: "AI분석오류", product: "프롬프트 파싱 실패", quantity: "0" }]
        }

        let promptCat = extractedItems[0]?.category || "기타";

        // --- FEATURE: Clear hallucinated extractions for non-order types to avoid 'unregistered product' failures ---
        if (["픽업고지", "상품후기", "기타", "문의", "픽업문의", "상품문의"].some(c => promptCat.includes(c))) {
            extractedItems = [];
        }

        // 5. Verification and Duplicates (Per ITEM)
        let generalClassifications: string[] = []
        let finalIntentResponse = "UNKNOWN";
        
        // CRM Tags check (General context)
        if (settings?.crm_tags) {
            const crmMatches = settings.crm_tags.filter((t: any) => t.type === 'crm' && chat_content.includes(t.name) || nickname.includes(t.name))
            if (crmMatches.length > 0) {
                generalClassifications.push(crmMatches[0].name)
            }
        }

        // --- OPTIMIZATION: Defer stock RPC until we know it's an actual order message ---
        if (extractedItems.length > 0 && productIds.length > 0) {
            const { data: rpcData, error: rpcErr } = await supabase.rpc('get_product_sales_sum', {
                p_store_id: store_id,
                p_product_ids: productIds
            });
            if (rpcData && !rpcErr) {
                const qtyMap: Record<string, number> = {};
                for (const item of rpcData) {
                    qtyMap[item.product_id] = parseInt(item.total_quantity, 10) || 0;
                }
                for (const p of products) {
                    if (p.allocated_stock !== null) {
                        p.remaining_stock = Math.max(0, p.allocated_stock - (qtyMap[p.id] || 0));
                    }
                }
            } else if (rpcErr) {
                console.error("RPC Error:", rpcErr);
            }
        }

        if (extractedItems.length === 0) {
            // Handle non-order or empty extractions (e.g., 픽업고지, 문의)
            let classifications = [...generalClassifications, `분류:${promptCat}`];
            const classificationStr = classifications.join(", ") || null;
            const finalIntent = promptCat === "픽업고지" ? "픽업고지" : promptCat === "주문취소" ? "COMPLAINT" : promptCat.includes("문의") ? "INQUIRY" : "UNKNOWN";
            finalIntentResponse = finalIntent;
            
            await supabase.from('chat_logs').update({
                is_processed: false,
                product_name: "X",
                category: finalIntent,
                classification: classificationStr
            }).eq('id', logId);
        } else {
            // Process EACH item individually enforcing strict 1:1 validation rules
            for (let i = 0; i < extractedItems.length; i++) {
                const item = extractedItems[i];
                let classifications = [...generalClassifications, `분류:${promptCat}`];
                let isDuplicate = false;
                
                let fixedProductName = item.product;

                if (products) {
                    // 매칭 후보: 상시판매 제외 + KST 오늘 이후 + 재고 있음
                    const availableCandidates = products.filter(p => isMatchableProduct(p) && (p.allocated_stock === null || p.allocated_stock > 0));
                    fixedProductName = await matchProductWithAI(item.product, availableCandidates);

                    if (fixedProductName === item.product && !availableCandidates.find(p => p.collect_name === fixedProductName)) {
                        // 품절 후보도 같은 날짜 필터 적용
                        const soldoutCandidates = products.filter(p => isMatchableProduct(p) && p.allocated_stock !== null && p.allocated_stock <= 0);
                        if (soldoutCandidates.length > 0) {
                            fixedProductName = await matchProductWithAI(item.product, soldoutCandidates);
                        }
                    }

                    item.product = fixedProductName;
                    const qty = parseInt(item.quantity, 10) || 1;

                    // 최종 lookup: 같은 이름 후보 중 우선순위(미래>과거3일>상시판매) 정렬 후 재고 충분한 것 우선
                    const lookupPool = products.filter(isMatchableProduct);
                    const sameNameSorted = sortByMatchPriority(lookupPool.filter(p => p.collect_name === fixedProductName));
                    const matchedProduct =
                        sameNameSorted.find(p => p.remaining_stock === null || p.remaining_stock >= qty)
                        || sameNameSorted[0];

                    if (matchedProduct) {
                        const isOutOfStock = matchedProduct.remaining_stock !== null && matchedProduct.remaining_stock < qty;

                        // Local decrement so future iterations accounting for same product know the stock dropped
                        if (!isOutOfStock && matchedProduct.remaining_stock !== null) {
                            matchedProduct.remaining_stock -= qty; 
                        }

                        // 픽업일은 오직 매칭된 상품에서 결정됨 (상품 등록 시 target_date 필수)
                        item.finalDateStr = matchedProduct.is_regular_sale ? '1900-01-01' : matchedProduct.target_date;

                        if (isOutOfStock) classifications.push("재고초과주문");

                        // Check duplicate
                        const { data: existingOrders } = await supabase.from('orders')
                            .select('id, order_items(product_id)')
                            .eq('store_id', store_id)
                            .eq('pickup_date', item.finalDateStr)
                            .eq('customer_nickname', nickname);

                        if (existingOrders && existingOrders.length > 0) {
                            for (const eo of existingOrders) {
                                if (eo.order_items.some((oi: any) => oi.product_id === matchedProduct.id)) {
                                    isDuplicate = true;
                                    break;
                                }
                            }
                        }
                        item.matchedProduct = matchedProduct;

                    } else {
                        classifications.push("상품미등록");
                    }
                }

                if (isDuplicate) classifications.push("중복주의");

                const classificationStr = classifications.join(", ") || null;
                
                // Final gate block
                const isActualOrder = (promptCat.includes("주문") || promptCat.includes("예약"))
                    && !promptCat.includes("취소") && !promptCat.includes("문의")
                    && !classifications.includes("재고초과주문")
                    && !classifications.includes("상품미등록");

                const finalIntent = isActualOrder ? "ORDER" : promptCat === "픽업고지" ? "픽업고지" : (classifications.includes("재고초과주문") || classifications.includes("상품미등록")) ? "UNKNOWN" : promptCat === "주문취소" ? "COMPLAINT" : promptCat.includes("문의") ? "INQUIRY" : "UNKNOWN";
                if (i === 0) finalIntentResponse = finalIntent;

                // Save to Orders DB
                if (isActualOrder && item.matchedProduct) {
                    const targetDateStr = item.matchedProduct.is_regular_sale ? '1900-01-01' : item.matchedProduct.target_date;
                    if (!targetDateStr) {
                        console.error("[collect] matchedProduct has no target_date and is not regular_sale — skipping order insert", item.matchedProduct.id);
                        continue;
                    }

                    const { data: orderData } = await supabase.from('orders').insert({
                        store_id,
                        pickup_date: targetDateStr,
                        customer_nickname: nickname,
                        is_received: false,
                        is_hidden: false,
                        customer_memo_1: isDuplicate ? "중복 접수됨" : null
                    }).select().single();

                    if (orderData) {
                        const { error: itemError } = await supabase.from('order_items').insert({
                            order_id: orderData.id,
                            product_id: item.matchedProduct.id,
                            quantity: item.quantity || 1
                        });

                        // order_items 실패 시 빈 주문 삭제
                        if (itemError) {
                            await supabase.from('orders').delete().eq('id', orderData.id);
                            console.error("order_items insert failed, removed empty order:", itemError.message);
                        }
                    }
                }

                // Update original OR Insert new chat_log for dashboard split view
                let q = parseInt(item.quantity, 10);
                if (i === 0) {
                    const { error: finalUpdateError } = await supabase.from('chat_logs').update({
                        category: finalIntent,
                        is_processed: isActualOrder,
                        product_name: fixedProductName,
                        quantity: isNaN(q) ? null : q,
                        collect_date: collect_date,
                        classification: classificationStr
                    }).eq('id', logId);
                    
                    if (finalUpdateError) console.error("Update Error:", finalUpdateError)
                } else {
                    const { error: splitInsertErr } = await supabase.from('chat_logs').insert({
                        store_id,
                        nickname,
                        chat_content,
                        chat_time: parsedTime,
                        collect_date: collect_date,
                        category: finalIntent,
                        is_processed: isActualOrder,
                        product_name: fixedProductName,
                        quantity: isNaN(q) ? null : q,
                        classification: classificationStr,
                        msg_hash: msgHash
                    });
                    if (splitInsertErr) console.error("SPLIT INSERT ERR:", splitInsertErr);
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Order strictly parsed, duplicate checks applied, and saved!',
            intent: finalIntentResponse,
            extracted: extractedItems
        })

    } catch (e: any) {
        console.error("API collect route error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
