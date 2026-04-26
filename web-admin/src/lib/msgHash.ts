import { createHash } from 'crypto'

export function computeMsgHash(
    store_id: string,
    nickname: string,
    chat_time: string,
    chat_content: string
): string {
    return createHash('sha256')
        .update(`${store_id}:${nickname}:${chat_time}:${chat_content}`)
        .digest('hex')
}
