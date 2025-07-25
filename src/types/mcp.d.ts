// src/types/mcp.d.ts (修正版)

/**
 * MCPサーバーが受け取る基本的なコマンド構造
 */
export interface BaseMcpCommand {
    type: string; // コマンドの種類（例: 'followPlayer', 'sendMessage', 'getStatus'）
    id?: string;  // コマンドの一意なID（オプション、LLMがリクエストを追跡するために使用）
}

/**
 * 'followPlayer' コマンドの型定義
 */
export interface FollowPlayerCommand extends BaseMcpCommand {
    type: 'followPlayer';
    targetPlayer: string; // 追従するプレイヤー名
}

/**
 * 'sendMessage' コマンドの型定義
 */
export interface SendMessageCommand extends BaseMcpCommand {
    type: 'sendMessage';
    message: string; // 送信するメッセージ
}

/**
 * 'getStatus' コマンドの型定義
 */
export interface GetStatusCommand extends BaseMcpCommand {
    type: 'getStatus';
}

/**
 * 'mineBlock' コマンドの型定義 (新規追加)
 */
export interface MineBlockCommand extends BaseMcpCommand {
    type: 'mineBlock';
    blockId?: number;     // 採掘するブロックのID（例: 1 for Stone, 17 for Oak Log）
    blockName?: string;   // 採掘するブロックの名前（例: 'stone', 'oak_log'）
    quantity?: number;    // 採掘する個数 (デフォルト: 1個)
    maxDistance?: number; // 検索する最大距離 (デフォルト: 32ブロック)
}


/**
 * MCPサーバーが受け入れる全てのコマンドの結合型
 */
export type McpCommand =
    | FollowPlayerCommand
    | SendMessageCommand
    | GetStatusCommand
    | MineBlockCommand; // 新しいコマンドを追加

/**
 * MCPサーバーからの基本的な応答構造
 */
export interface BaseMcpResponse {
    status: 'success' | 'error' | 'pending'; // 応答ステータス
    commandId?: string; // 対応するコマンドのID（もしあれば）
    message?: string;   // ユーザー向けメッセージ
    data?: any;         // 追加データ（例: 状態情報、結果など）
}

/**
 * 成功応答の型定義
 */
export interface SuccessMcpResponse extends BaseMcpResponse {
    status: 'success';
    data?: any;
}

/**
 * エラー応答の型定義
 */
export interface ErrorMcpResponse extends BaseMcpResponse {
    status: 'error';
    message: string;
    details?: any; // エラーの詳細情報
}

/**
 * 処理中応答の型定義 (非同期コマンドの場合など)
 */
export interface PendingMcpResponse extends BaseMcpResponse {
    status: 'pending';
    message: string;
}

/**
 * MCPサーバーからの全ての応答の結合型
 */
export type McpResponse = SuccessMcpResponse | ErrorMcpResponse | PendingMcpResponse;
