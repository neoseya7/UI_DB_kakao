const extractedItems = [{ category: "주문", product: "오모가리 김치찌개 2 햄폭탄부대찌개 2", quantity: 1 }];

const newItems = [];
for (const item of extractedItems) {
    let combinedName = item.product || "";
    // Catch parenthesis spacing
    combinedName = combinedName.replace(/\)\s+([^\s])/g, '), $1');
    // Catch number spacing (e.g. "사과 2 바나나 3" -> "사과 2, 바나나 3")
    combinedName = combinedName.replace(/(\d)\s+([가-힣a-zA-Z])/g, '$1, $2');
    
    if (combinedName.includes(",") || combinedName.includes("+") || combinedName.includes("&") || combinedName.includes("/")) {
        const productsStr = combinedName.split(/[,+&/]/).map(s => s.trim()).filter(Boolean);
        const quantitiesStr = item.quantity ? item.quantity.toString().split(/[,+&/]/).map(s => s.trim()) : ["1"];
        
        for (let i = 0; i < productsStr.length; i++) {
            let rawName = productsStr[i];
            let itemQtyStr = quantitiesStr[i] || quantitiesStr[0] || "1";
            
            // Try matching (2) first
            let qtyMatch = rawName.match(/(.+?)(?:\((\d+)\))$/);
            if (qtyMatch) {
                rawName = qtyMatch[1].trim();
                itemQtyStr = qtyMatch[2];
            } else {
                // Try matching trailing number preceded by space or just trailing number
                const spaceNumMatch = rawName.match(/(.+?)\s*(\d+)$/);
                // Be careful not to strip numbers from "제이제이2773" or "오모가리" IF they are part of the brand? 
                // Usually product quantity is isolated: "사과 2"
                // If it's "몬타에어건1", match[2] is 1, match[1] is "몬타에어건". This is perfect!
                if (spaceNumMatch) {
                    rawName = spaceNumMatch[1].trim();
                    itemQtyStr = spaceNumMatch[2];
                }
            }
            newItems.push({ ...item, product: rawName, quantity: itemQtyStr });
        }
    }
}
console.log(newItems);
