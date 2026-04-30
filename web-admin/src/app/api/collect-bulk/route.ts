export const maxDuration = 300; // 5 minutes max per bulk execution (Pro plan)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { computeMsgHash } from '@/lib/msgHash'
import { STRICT_MATCHING_APPENDIX } from '@/lib/promptAppendix'

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
            supabase.from('products').select('id, collect_name, allocated_stock, target_date, is_regular_sale').eq('store_id', store_id).eq('is_hidden', false)
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
        const geminiKeyBackup = config?.gemini_api_key_backup
        const geminiModel = config?.gemini_model || 'gemini-1.5-flash'
        const openaiKey = config?.openai_api_key
        const openaiKeyBackup = config?.openai_api_key_backup
        const openaiModel = config?.openai_model || 'gpt-4o-mini'

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
        promptA += "\n\n[CRITICAL SYSTEM FORMATTING RULE]: If a user orders multiple different products in one message (e.g. '수박1 사과2' or '수박(1) 사과(2)'), YOU MUST NEVER COMBINE THEM INTO A SINGLE JSON OBJECT! You MUST explicitly separate them into an array of multiple JSON objects. Example output ALWAYS: [{\"product\": \"수박\", \"quantity\": 1}, {\"product\": \"사과\", \"quantity\": 2}]. Do NOT return {\"product\": \"수박 1 사과 2\"}!!";

        // KST 기준 오늘 날짜
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
            if (ra === 1) return (a.target_date || '').localeCompare(b.target_date || '')
            if (ra === 2) return (b.target_date || '').localeCompare(a.target_date || '')
            return 0
        })

        // --- NEW: PRODUCT VARIANT AWARENESS (collect와 동일 패턴, 날짜 필터 적용) ---
        const productNameList = products.filter(isMatchableProduct).map(p => p.collect_name).filter(Boolean);
        if (productNameList.length > 0) {
            promptA += `\n\n[REGISTERED PRODUCT LIST]: The store has these products: [${productNameList.join(', ')}]. IMPORTANT: When a number follows a product name (e.g. '석류즙30', '석류즙 60'), check if it matches a registered product variant (e.g. '석류즙(30포)', '석류즙(60포)'). If so, the number is a VARIANT IDENTIFIER, NOT a quantity. Output the matched product name exactly as registered with quantity 1. Example: '석류즙30' → {"product": "석류즙(30포)", "quantity": 1}, NOT {"product": "석류즙", "quantity": 30}.`;
        }

        // --- AI Fallback Chain: Gemini → Gemini Backup → OpenAI → OpenAI Backup ---
        let consecutiveFailures = 0

        const logAiError = async (provider: string, errorMessage: string, fallbackUsed: boolean, fallbackProvider: string | null) => {
            try {
                await supabase.from('ai_error_logs').insert({
                    provider,
                    error_message: errorMessage.slice(0, 500),
                    fallback_used: fallbackUsed,
                    fallback_provider: fallbackProvider,
                    store_id
                })
            } catch (e) { /* silent */ }
        }

        const callGeminiWithKey = async (sysPrompt: string, userText: string, apiKey: string, jsonMode: boolean = false) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`
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
                throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`)
            }
            const json = await res.json()
            return json.candidates?.[0]?.content?.parts?.[0]?.text || ""
        }

        const callOpenAIWithKey = async (sysPrompt: string, userText: string, apiKey: string, jsonMode: boolean = false) => {
            const body: any = {
                model: openaiModel,
                messages: [
                    { role: 'system', content: sysPrompt },
                    { role: 'user', content: userText }
                ],
                temperature: 0.1
            }
            if (jsonMode) {
                body.response_format = { type: "json_object" }
            }
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify(body)
            })
            if (!res.ok) {
                const errText = await res.text()
                throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200)}`)
            }
            const json = await res.json()
            return json.choices?.[0]?.message?.content || ""
        }

        const callAIWithFallback = async (sysPrompt: string, userText: string, jsonMode: boolean = false): Promise<string> => {
            const providers: { name: string; fn: () => Promise<string> }[] = []
            if (geminiKey) providers.push({ name: 'gemini', fn: () => callGeminiWithKey(sysPrompt, userText, geminiKey, jsonMode) })
            if (geminiKeyBackup) providers.push({ name: 'gemini-backup', fn: () => callGeminiWithKey(sysPrompt, userText, geminiKeyBackup, jsonMode) })
            // OpenAI json_object 모드는 최상위 객체만 허용해 배열 응답과 충돌하므로 JSON 모드 미적용 (프롬프트 + 기존 정규식 추출에 의존)
            if (openaiKey) providers.push({ name: 'openai', fn: () => callOpenAIWithKey(sysPrompt, userText, openaiKey) })
            if (openaiKeyBackup) providers.push({ name: 'openai-backup', fn: () => callOpenAIWithKey(sysPrompt, userText, openaiKeyBackup) })

            for (let i = 0; i < providers.length; i++) {
                try {
                    const result = await providers[i].fn()
                    consecutiveFailures = 0
                    return result
                } catch (err: any) {
                    const isLast = i === providers.length - 1
                    const fallbackProvider = isLast ? null : providers[i + 1]?.name
                    await logAiError(providers[i].name, err.message, !isLast, fallbackProvider)
                    if (isLast) {
                        consecutiveFailures++
                        throw err
                    }
                }
            }
            throw new Error('No AI providers configured')
        }

        // Keep backward-compatible alias
        const callGemini = callAIWithFallback

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
            const systemPrompt = systemPromptText.replace('{product_list}', productListStr) + STRICT_MATCHING_APPENDIX;
            const userPrompt = `user_product_name: "${userProductName}"`;
            let result = await callGemini(systemPrompt, userPrompt);
            result = result.replace(/```json/gi, "").replace(/```/g, "").trim();
            if (result.includes("user_product_name:")) result = result.split("user_product_name:")[1].trim();
            if (result.includes("Input:")) result = result.split("Input:")[1].trim();
            const cleanResult = result.replace(/['"\n]/g, "").trim();

            // 환각 검증: 후보에 존재 + 입력과 공통 글자 ≥ 2 (collect와 동일)
            if (productCandidates.find(p => p.collect_name === cleanResult)) {
                const set1 = new Set(userProductName.replace(/\s/g, "").split(''));
                const set2 = new Set(cleanResult.replace(/\s/g, "").split(''));
                const intersection = new Set([...set1].filter(x => set2.has(x)));
                if (intersection.size >= 2) return cleanResult;
            }

            return userProductName;
        }

        const success_hashes: string[] = []

        // Process sequentially to be safe against Gemini rate limits
        for (const msg of messages) {
            let logId: string | null = null;
            try {
                const { hash: clientHash, nickname, chat_content, chat_time, collect_date } = msg

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

                // Server-side hash (DB저장/dedup용). 클라이언트가 hash 안 보내도 1차 dedup가 동작하도록.
                const hash = computeMsgHash(store_id, nickname || '', parsedTime, chat_content)

                const isSystem = !nickname || nickname === "System" || nickname === "시스템" || nickname === "카카오톡" || nickname === "알림톡" || nickname === "알수없음"
                
                const normalizeNick = (n: string) => n ? n.toString().replace(/\[|\]|\s/g, '') : ''
                const cleanNickname = normalizeNick(nickname)
                const isManager = managerNicks.some((n: string) => normalizeNick(n) === cleanNickname)

                if (isSystem || isManager) {
                    success_hashes.push(clientHash || hash)
                    continue
                }

                // Dedup 1차: msg_hash (동일 닉네임 재수집 차단)
                // 서버에서 (store_id, nickname, parsedTime, chat_content)로 hash를 항상 계산하므로
                // 클라이언트가 hash를 안 보내거나 빈 값을 보내도 1차 dedup가 동작함.
                // .limit(1) 사용: 기존 중복 row가 2개 이상이어도 안전하게 match 판정
                {
                    const { data: byHash } = await supabase.from('chat_logs')
                        .select('id')
                        .eq('store_id', store_id)
                        .eq('msg_hash', hash)
                        .limit(1)
                    if (byHash && byHash.length > 0) {
                        success_hashes.push(clientHash || hash)
                        continue
                    }
                }

                // Dedup 2차: content fallback (닉네임 변경 케이스 차단)
                // .limit(1) 사용: 기존 중복 row가 2개 이상이어도 안전하게 match 판정
                const { data: byContent } = await supabase.from('chat_logs')
                    .select('id')
                    .eq('store_id', store_id)
                    .eq('collect_date', collect_date)
                    .eq('chat_time', parsedTime)
                    .eq('chat_content', chat_content)
                    .limit(1)
                if (byContent && byContent.length > 0) {
                    success_hashes.push(clientHash || hash)
                    continue
                }

                // Dedup 3차: 재유입 차단 (3일 윈도우, 닉+시각+내용 정확일치)
                // 2차는 collect_date=today 한정이라 날짜 경계 넘어 재수집되면 miss됨. 이를 보완.
                // 관리자삭제 sentinel은 제외 → 사용자가 의도적으로 되살리는 케이스 허용.
                // length >= 8 가드로 짧은 "네"/"ㅇㅇ" 등 오탐 방지.
                if (chat_content && chat_content.length >= 8) {
                    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
                    const { data: byReingestion } = await supabase.from('chat_logs')
                        .select('id, classification')
                        .eq('store_id', store_id)
                        .eq('nickname', nickname)
                        .eq('chat_time', parsedTime)
                        .eq('chat_content', chat_content)
                        .gte('collect_date', threeDaysAgo)
                        .limit(5)
                    const blocking = byReingestion?.find(r => r.classification !== '분류:관리자삭제')
                    if (blocking) {
                        console.log('[dedup-3] blocked re-ingestion', { store_id, nickname, chat_time: parsedTime, len: chat_content.length, matched_id: blocking.id })
                        success_hashes.push(clientHash || hash)
                        continue
                    }
                }

                // Initial chat log insert
                const { data: logData, error: logError } = await supabase.from('chat_logs').insert({
                    store_id, nickname, chat_content, chat_time: parsedTime, collect_date, category: 'UNKNOWN', msg_hash: hash
                }).select().single()

                if (logError) throw new Error("Log Insert Fail: " + logError.message)
                logId = logData.id

                // INSERT 성공한 시점에 success_hashes에 push.
                // AI 처리가 catch 에러나 함수 timeout으로 실패하더라도 스크래퍼가 재전송하지 않도록.
                // 운영자는 cls=null 또는 cls='AI오류'를 오늘의대화에서 보고 주문관리에서 수동 처리.
                success_hashes.push(clientHash || hash)

                if (!geminiKey) {
                    continue
                }

                // AI Intent Analysis
                const extractedRaw = await callGemini(promptA, chat_content, true)
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

                let promptCat = extractedItems[0]?.category || "기타";

                if (["픽업고지", "상품후기", "기타", "문의", "픽업문의", "상품문의"].some(c => promptCat.includes(c))) {
                    extractedItems = [];
                }

                const isCancellationGlobal = promptCat.includes("취소") || promptCat === "주문취소";

                let generalClassifications: string[] = []
                const crmMatches = settings?.crm_tags?.filter((t: any) => t.type === 'crm' && (chat_content.includes(t.name) || nickname.includes(t.name))) || []
                if (crmMatches.length > 0) generalClassifications.push(crmMatches[0].name)

                // AI 분석 직후 chat_log를 즉시 업데이트 (이후 timeout 발생 시에도 분류 결과 보존)
                const earlyClassifications = [...generalClassifications, `분류:${promptCat}`];
                const earlyClassificationStr = earlyClassifications.join(", ") || null;
                const earlyIntent = extractedItems.length > 0 && (promptCat.includes("주문") || promptCat.includes("예약")) && !isCancellationGlobal
                    ? "ORDER" : isCancellationGlobal ? "COMPLAINT" : promptCat === "픽업고지" ? "픽업고지" : promptCat.includes("문의") ? "INQUIRY" : "UNKNOWN";
                await supabase.from('chat_logs').update({
                    category: earlyIntent,
                    classification: earlyClassificationStr,
                    product_name: extractedItems[0]?.product || "X",
                }).eq('id', logId);

                if (extractedItems.length === 0) {
                    let classifications = [...generalClassifications, `분류:${promptCat}`];
                    const classificationStr = classifications.join(", ") || null;
                    const finalIntent = isCancellationGlobal ? "COMPLAINT" : promptCat === "픽업고지" ? "픽업고지" : promptCat.includes("문의") ? "INQUIRY" : "UNKNOWN";
                    
                    await supabase.from('chat_logs').update({
                        is_processed: false,
                        product_name: "X",
                        category: finalIntent,
                        classification: classificationStr
                    }).eq('id', logId);
                } else {
                    for (let i = 0; i < extractedItems.length; i++) {
                        const item = extractedItems[i];
                        let classifications = [...generalClassifications, `분류:${promptCat}`];
                        let isDuplicate = false;
                        
                        let fixedProductName = item.product;

                        if (products) {
                            // AI 호출 전 전체 products(available+soldout, 단 날짜 필터 적용) 정확일치 우선 체크.
                            // 기존 matchProductWithAI 내 exact match는 전달된 리스트 내에서만 동작하므로,
                            // soldout 상품에 정확 일치하는 입력이 오면 AI가 유사어로 오매칭할 수 있음.
                            const matchablePool = products.filter(isMatchableProduct);
                            const exactInAll = matchablePool.find(p => p.collect_name === item.product);
                            if (exactInAll) {
                                fixedProductName = item.product;
                            } else {
                                // 매칭 후보: 상시판매 제외 + KST 오늘 이후 + 재고 있음
                                const availableCandidates = matchablePool.filter(p => p.allocated_stock === null || p.allocated_stock > 0);
                                fixedProductName = await matchProductWithAI(item.product, availableCandidates);

                                if (fixedProductName === item.product && !availableCandidates.find(p => p.collect_name === fixedProductName)) {
                                    // 품절 후보도 같은 날짜 필터 적용
                                    const soldoutCandidates = matchablePool.filter(p => p.allocated_stock !== null && p.allocated_stock <= 0);
                                    if (soldoutCandidates.length > 0) {
                                        fixedProductName = await matchProductWithAI(item.product, soldoutCandidates);
                                    }
                                }
                            }

                            item.product = fixedProductName;

                            const qty = parseInt(item.quantity, 10) || 1;
                            // 최종 lookup: 같은 이름 후보 중 우선순위(미래>과거3일>상시판매) 정렬 후 재고 충분한 것 우선
                            const sameNameSorted = sortByMatchPriority(matchablePool.filter(p => p.collect_name === fixedProductName));
                            const matchedProduct =
                                sameNameSorted.find(p => p.remaining_stock === null || p.remaining_stock >= qty)
                                || sameNameSorted[0];

                            if (matchedProduct) {
                                const isOutOfStock = matchedProduct.remaining_stock !== null && matchedProduct.remaining_stock < qty;

                                if (!isOutOfStock && matchedProduct.remaining_stock !== null) {
                                    matchedProduct.remaining_stock -= qty;
                                }

                                // 픽업일은 오직 매칭된 상품에서 결정됨 (상품 등록 시 target_date 필수)
                                item.finalDateStr = matchedProduct.is_regular_sale ? '1900-01-01' : matchedProduct.target_date;

                                if (isOutOfStock) classifications.push("재고초과주문");

                                const { data: existingOrders } = await supabase.from('orders')
                                    .select('id, order_items(product_id)')
                                    .eq('store_id', store_id)
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

                        // 자동 취소반영 중단: 취소 분류는 chat_logs.classification 태그로만 기록, orders 테이블에 음수 insert 하지 않음. 관리자 수동 삭제로 처리.
                        const shouldSaveToOrders = isActualOrder;
                        const finalIntent = isActualOrder ? "ORDER" : (classifications.includes("재고초과주문") || classifications.includes("상품미등록")) ? "UNKNOWN" : isCancellation ? "COMPLAINT" : promptCat.includes("문의") ? "INQUIRY" : "UNKNOWN";

                        // Save to Orders DB
                        if (shouldSaveToOrders && item.matchedProduct) {
                            const targetDateStr = item.matchedProduct.is_regular_sale ? '1900-01-01' : item.matchedProduct.target_date;
                            if (!targetDateStr) {
                                console.error("[collect-bulk] matchedProduct has no target_date and is not regular_sale — skipping order insert", item.matchedProduct.id);
                                continue;
                            }

                            const { data: orderData } = await supabase.from('orders').insert({
                                store_id,
                                pickup_date: targetDateStr,
                                customer_nickname: nickname,
                                is_received: false,
                                is_hidden: false,
                                customer_memo_1: isCancellation ? "자동 취소반영" : (isDuplicate ? "중복 접수됨" : "AI 수집")
                            }).select().single();

                            if (orderData) {
                                let itemQty = parseInt(item.quantity, 10) || 1;
                                if (isCancellation) itemQty = -Math.abs(itemQty);

                                const { error: itemError } = await supabase.from('order_items').insert({
                                    order_id: orderData.id,
                                    product_id: item.matchedProduct.id,
                                    quantity: itemQty
                                });

                                // order_items 실패 시 빈 주문 삭제
                                if (itemError) {
                                    await supabase.from('orders').delete().eq('id', orderData.id);
                                    console.error("order_items insert failed, removed empty order:", itemError.message);
                                }
                            }
                        }

                        // Update or Insert chat log
                        let q = parseInt(item.quantity, 10);
                        if (!isNaN(q) && q > 0 && isCancellation) q = -Math.abs(q);
                        
                        if (i === 0) {
                            const { error: finalUpdateError } = await supabase.from('chat_logs').update({
                                is_processed: shouldSaveToOrders,
                                product_name: fixedProductName,
                                quantity: isNaN(q) ? null : q,
                                category: finalIntent,
                                collect_date: collect_date,
                                classification: classificationStr
                            }).eq('id', logId);
                            
                            if (finalUpdateError) console.error("Update Error:", finalUpdateError)
                        } else {
                            await supabase.from('chat_logs').insert({
                                store_id,
                                nickname,
                                chat_content,
                                chat_time: parsedTime,
                                collect_date: collect_date,
                                category: finalIntent,
                                is_processed: shouldSaveToOrders,
                                product_name: fixedProductName,
                                quantity: isNaN(q) ? null : q,
                                classification: classificationStr,
                                msg_hash: hash
                            });
                        }
                    }
                }

                // success_hashes는 INSERT 직후 이미 push됨 (라인 ~325 참조).
                // 정상 처리 끝났으니 별도 push 불필요.

            } catch (err: any) {
                console.error("Bulk processing error for a message:", err)
                // chat_log가 이미 삽입된 상태에서 에러 발생 시, 에러 표시를 남겨 "기타"와 구분
                if (logId) {
                    try {
                        await supabase.from('chat_logs').update({
                            classification: `분류:AI오류 (${(err?.message || 'unknown').slice(0, 100)})`,
                            product_name: "X",
                        }).eq('id', logId).eq('classification', null);  // 이미 early update된 경우 덮어쓰지 않음
                    } catch (_) { /* silent */ }
                }
                // success_hashes는 INSERT 직후 이미 push됨 → 스크래퍼는 재전송 안 함.
                // 운영자가 'AI오류' 표시 보고 주문관리에서 수동 처리.
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
