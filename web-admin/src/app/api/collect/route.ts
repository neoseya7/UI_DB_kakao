import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
            supabase.from('products').select('id, collect_name, allocated_stock, target_date').eq('store_id', store_id).eq('is_hidden', false)
        ])

        const productIds = productsRaw?.map((p: any) => p.id) || [];
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

        const products = productsRaw?.map((p: any) => ({
            ...p,
            collect_name: p.collect_name ? p.collect_name.trim() : "",
            remaining_stock: p.allocated_stock !== null ? Math.max(0, p.allocated_stock - (qtyMap[p.id] || 0)) : null
        })) || []

        // 2. Filter out Manager and System messages to save AI tokens & DB space
        const managerNicks = settings?.crm_tags?.filter((t: any) => t.type === 'manager').map((t: any) => t.name) || []
        const isSystem = !nickname || nickname === "System" || nickname === "시스템" || nickname === "카카오톡" || nickname === "알림톡" || nickname === "알수없음"
        
        const normalizeNick = (n: string) => n ? n.toString().replace(/\[|\]|\s/g, '') : ''
        const cleanNickname = normalizeNick(nickname)
        const isManager = managerNicks.some((n: string) => normalizeNick(n) === cleanNickname)

        if (isSystem || isManager) {
            return NextResponse.json({ success: true, message: 'Message ignored (System or Manager)' })
        }

        // 3. Save Raw Log immediately (safe fallback)
        const { data: logData, error: logError } = await supabase.from('chat_logs').insert({
            store_id, nickname, chat_content, chat_time: parsedTime, collect_date, category: 'UNKNOWN'
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
            const systemPrompt = systemPromptText.replace('{product_list}', productListStr);
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
        const extractedRaw = await callGemini(promptA, chat_content)

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
        }

        if (extractedItems.length === 0) {
            extractedItems = [{ category: "AI분석오류", product: "프롬프트 파싱 실패", quantity: "0" }]
        }

        const firstItem = extractedItems[0]
        let promptCat = firstItem?.category || "기타";

        // 5. Verification and Duplicates
        let classifications: string[] = []

        // Push the EXACT korean category so the UI can parse it!
        classifications.push(`분류:${promptCat}`)

        // CRM Tags check
        if (settings?.crm_tags) {
            const crmMatches = settings.crm_tags.filter((t: any) => t.type === 'crm' && chat_content.includes(t.name) || nickname.includes(t.name))
            if (crmMatches.length > 0) {
                classifications.push(crmMatches[0].name) // Just push the tag name, e.g., 'VIP' or '노쇼고객'
            }
        }

        let isDuplicate = false

        if (firstItem) {
            let fixedProductName = firstItem.product;

            if (products) {
                // Two-Stage AI Matching exactly like Legacy app.py
                const availableCandidates = products.filter(p => p.allocated_stock === null || p.allocated_stock > 0);
                fixedProductName = await matchProductWithAI(firstItem.product, availableCandidates);

                if (fixedProductName === firstItem.product && !availableCandidates.find(p => p.collect_name === fixedProductName)) {
                    const soldoutCandidates = products.filter(p => p.allocated_stock !== null && p.allocated_stock <= 0);
                    if (soldoutCandidates.length > 0) {
                        fixedProductName = await matchProductWithAI(firstItem.product, soldoutCandidates);
                    }
                }

                // Use the matching result
                firstItem.product = fixedProductName;
                
                const qty = parseInt(firstItem.quantity, 10) || 1;
                const matchedProduct = 
                    products.find(p => p.collect_name === fixedProductName && (p.remaining_stock === null || p.remaining_stock >= qty))
                    || products.find(p => p.collect_name === fixedProductName);

                if (matchedProduct) {
                    // Check stock first
                    const isOutOfStock = matchedProduct.remaining_stock !== null && matchedProduct.remaining_stock < qty;

                    if (!isOutOfStock && matchedProduct.remaining_stock !== null) {
                        matchedProduct.remaining_stock -= qty;
                    }

                    // Inject pickup date (target_date) from matched product if not specified
                    if (!firstItem.pickup_date || firstItem.pickup_date === "날짜미지정" || firstItem.pickup_date.trim() === "") {
                        if (matchedProduct.target_date) {
                            firstItem.pickup_date = matchedProduct.target_date;
                        } else {
                            if (!isOutOfStock) {
                                classifications.push("날짜미지정");
                            }
                        }
                    }

                    if (isOutOfStock) {
                        classifications.push("재고초과주문")
                    }

                    // Check duplicate
                    const { data: existingOrders } = await supabase.from('orders')
                        .select('id, order_items(product_id)')
                        .eq('store_id', store_id)
                        .eq('pickup_date', collect_date) // using collect_date roughly to narrow scope
                        .eq('customer_nickname', nickname)

                    if (existingOrders && existingOrders.length > 0) {
                        for (const eo of existingOrders) {
                            if (eo.order_items.some((oi: any) => oi.product_id === matchedProduct.id)) {
                                isDuplicate = true
                                break
                            }
                        }
                    }
                } else {
                    classifications.push("날짜미지정"); // Missing matching product
                }
            } else {
                if (!firstItem.pickup_date || firstItem.pickup_date === "날짜미지정" || firstItem.pickup_date.trim() === "") {
                    classifications.push("날짜미지정");
                }
            }
        }

        if (isDuplicate) {
            classifications.push("중복주의")
        }

        const classificationString = classifications.join(", ")

        // Determine if this is an actual order that must be saved to the database
        const isActualOrder = (promptCat === "픽업고지" || promptCat.includes("주문") || promptCat.includes("예약"))
            && !promptCat.includes("취소") && !promptCat.includes("문의")
            && !classifications.includes("재고초과주문"); // BLOCK excess stock orders from proceeding directly to DB

        // 5.1 Ensure base category is aligned with the intent logic
        const finalIntent = isActualOrder ? "ORDER" : classifications.includes("재고초과주문") ? "UNKNOWN" : promptCat === "주문취소" ? "COMPLAINT" : promptCat.includes("문의") ? "INQUIRY" : "UNKNOWN";
        await supabase.from('chat_logs').update({ category: finalIntent }).eq('id', logId)

        // 6. Save to Orders DB
        if (extractedItems.length > 0 && isActualOrder) {
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
                customer_memo_1: isDuplicate ? "중복 접수됨" : "AI 수집"
            }).select().single()

            if (orderData) {
                for (const item of extractedItems) {
                    const matchedProduct = products?.find(p => p.collect_name === item.product)
                    if (matchedProduct) {
                        await supabase.from('order_items').insert({
                            order_id: orderData.id,
                            product_id: matchedProduct.id,
                            quantity: item.quantity || 1
                        })
                    }
                }
            }
        }

        // Finalize chat log (Always save classification regardless of whether it's an order)
        const classificationStr = classificationString || null;

        if (extractedItems.length === 0) {
            await supabase.from('chat_logs').update({
                is_processed: isActualOrder,
                product_name: "-",
                classification: classificationStr
            }).eq('id', logId);
        } else {
            for (let i = 0; i < extractedItems.length; i++) {
                const item = extractedItems[i];
                let q = parseInt(item.quantity, 10);
                
                const pName = item.product;

                if (i === 0) {
                    const { error: finalUpdateError } = await supabase.from('chat_logs').update({
                        is_processed: isActualOrder,
                        product_name: pName,
                        quantity: isNaN(q) ? null : q,
                        classification: classificationStr
                    }).eq('id', logId);
                    
                    if (finalUpdateError) {
                        console.error("Silent Postgres Update Error on chat_logs:", finalUpdateError)
                    }
                } else {
                    await supabase.from('chat_logs').insert({
                        store_id,
                        nickname,
                        chat_content,
                        chat_time: parsedTime,
                        collect_date,
                        category: finalIntent,
                        is_processed: isActualOrder,
                        product_name: pName,
                        quantity: isNaN(q) ? null : q,
                        classification: classificationStr
                    });
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Order strictly parsed, duplicate checks applied, and saved!',
            intent: finalIntent,
            extracted: extractedItems
        })

    } catch (e: any) {
        console.error("API collect route error:", e)
        return NextResponse.json({ success: false, error: e.message || 'Server Error' }, { status: 500 })
    }
}
