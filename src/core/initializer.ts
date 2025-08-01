// src/core/initializer.ts (新規作成)

import { BOT_TOOLS_SCHEMA } from '../config/toolsSchema';

/**
 * mcpoとの初期化シーケンス（ハンドシェイク）を専門に処理する。
 * @param request mcpoからのリクエストオブジェクト
 * @returns ハンドシェイク用の応答オブジェクト。該当しない場合はnull。
 */
export function handleInitializationSequence(request: any): object | null {
    if (request.method === 'initialize') {
        return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
                capabilities: {},
                protocolVersion: request.params.protocolVersion,
                serverInfo: { name: "my-minecraft-bot", version: "2.0.0" }
            }
        };
    }

    if (request.method === 'notifications/initialized') {
        // 'initialized'通知には応答しないが、処理済みとして扱うため空のオブジェクトを返す
        return {}; 
    }

    if (request.method === 'tools/list') {
        return {
            jsonrpc: '2.0',
            id: request.id,
            result: { tools: BOT_TOOLS_SCHEMA }
        };
    }

    // 初期化シーケンスに関連するリクエストではなかった
    return null;
}
