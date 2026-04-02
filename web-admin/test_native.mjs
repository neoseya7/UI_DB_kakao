import fs from 'fs';

async function testEndpoint() {
    const payload = {
        store_id: "9018fcb3-897d-47f2-8396-1f4ddf5701c9",
        collect_date: "2026-04-02",
        chat_time: "07:10:00",
        nickname: "에스티움하하",
        chat_content: "[에스티움 하하] [오전 7:10] 대저토마토 1 천혜향1"
    };

    try {
        const response = await fetch('http://localhost:3000/api/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        fs.writeFileSync('error_text_result.txt', text, 'utf8');
        console.log("Written to error_text_result.txt");
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

testEndpoint();
