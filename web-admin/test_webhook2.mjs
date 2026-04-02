import fetch from 'node-fetch';

async function testEndpoint() {
    const payload = {
        store_id: "9018fcb3-897d-47f2-8396-1f4ddf5701c9",
        collect_date: "2026-04-02",
        chat_time: "07:10:00",
        nickname: "에스티움하하_테스트",
        chat_content: "[에스티움 하하] [오전 7:10] 대저토마토 1 천혜향1 테스트"
    };

    try {
        const response = await fetch('http://localhost:3000/api/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        console.log("RAW_TEXT: " + text);
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

testEndpoint();
