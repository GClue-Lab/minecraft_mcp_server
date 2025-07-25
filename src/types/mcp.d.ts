// src/types/mcp.d.ts (最終版 - AttackMobCommandにmaxAttemptsを追加)

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
    distanceThreshold?: number; // プレイヤーに近づく目標距離
    recheckInterval?: number;   // 追従ロジックを再確認する間隔 (ミリ秒)
    maxPathfindingAttempts?: number; // 経路探索の最大試行回数 (失敗時)
    maxFallbackPathfindingRange?: number; // 新規追加: ジャンプで越えられない場合に迂回を試みる範囲
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
 * 'mineBlock' コマンドの型定義
 */
export interface MineBlockCommand extends BaseMcpCommand {
    type: 'mineBlock';
    blockId?: number | null;
    blockName?: string | null;
    quantity?: number;
    maxDistance?: number;
}

/**
 * 'attackMob' コマンドの型定義
 */
export interface AttackMobCommand extends BaseMcpCommand {
    type: 'attackMob';
    targetMobName?: string; // 例: 'zombie', 'skeleton'
    maxCombatDistance?: number; // ターゲットを探す最大距離
    attackRange?: number; // ターゲットに近づく距離 (攻撃できる距離)
    stopAfterKill?: boolean; // 1体倒したら停止するかどうか
    maxAttempts?: number; // <<<< ここが重要: これが存在するか確認します <<<<
}

/**
 * 'stop' コマンドの型定義
 */
export interface StopCommand extends BaseMcpCommand {
    type: 'stop'; // 現在実行中の行動を停止する
}

/**
 * 'connect' コマンドの型定義
 */
export interface ConnectCommand extends BaseMcpCommand {
    type: 'connect';
}

/**
 * 'setCombatMode' コマンドの型定義
 */
export interface SetCombatModeCommand extends BaseMcpCommand {
    type: 'setCombatMode';
    mode: 'on' | 'off'; // 'on' で警戒モードON, 'off' でOFF
}

/**
 * 'teleport' コマンドの型定義 (新規追加)
 */
export interface TeleportCommand extends BaseMcpCommand {
    type: 'teleport';
    x: number;
    y: number;
    z: number;
    // 必要であれば、yaw, pitchなども追加可能
}

/**
 * MCPサーバーが受け入れる全てのコマンドの結合型
 */
export type McpCommand =
    | FollowPlayerCommand
    | SendMessageCommand
    | GetStatusCommand
    | MineBlockCommand
    | AttackMobCommand
    | StopCommand
    | ConnectCommand
    | SetCombatModeCommand
    | TeleportCommand;

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
