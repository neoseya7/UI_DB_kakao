const parsedItems = [ { category: "주문", product: "감바스 1 항정살1", quantity: 2 } ];
let extractedItems = parsedItems;

if (extractedItems.length > 0) {
    const newItems = [];
    for (const item of extractedItems) {
        let combinedName = item.product || "";
        combinedName = combinedName.replace(/\)\s+([^\s])/g, '), $1');
        combinedName = combinedName.replace(/(\d)\s+([가-힣a-zA-Z])/g, '$1, $2');
        
        console.log("combinedName:", combinedName);
        
        if (combinedName.includes(",") || combinedName.includes("+") || combinedName.includes("&") || combinedName.includes("/")) {
            const productsStr = combinedName.split(/[,+&/]/).map(s => s.trim()).filter(Boolean);
            const quantitiesStr = item.quantity ? item.quantity.toString().split(/[,+&/]/).map(s => s.trim()) : ["1"];
            
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
            console.log("No split needed");
        }
    }
    extractedItems = newItems;
}

console.log("Middle stage:", extractedItems);
