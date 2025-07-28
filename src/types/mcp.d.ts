// src/types/mcp.d.ts v1.10

// Vec3 は mcp.d.ts で直接定義せず、使用する場所でインポートするか、
// 必要であれば { x: number, y: number, z: number } のように具体的な構造で記述します。
// ここでは CurrentBehavior の target に直接 { x: number, y: number, z: number } を使います。
// import { Vec3 } from 'vec3'; // <<< 削除

/**
 * 行動の種類を定義 (BehaviorEngine から移動)
 */
export type BehaviorName = 'combat' | 'followPlayer' | 'mineBlock' | 'idle'; // <<< export

/**
 * MCPサーバーが受け取る基本的なコマンド構造
 */
export interface BaseMcpCommand { // <<< export
    type: string;
    id?: string;
}

/**
 * 'followPlayer' コマンドの型定義
 */
export interface FollowPlayerCommand extends BaseMcpCommand { // <<< export
    type: 'followPlayer';
    targetPlayer: string;
    distanceThreshold?: number;
    recheckInterval?: number;
}

/**
 * 'sendMessage' コマンドの型定義
 */
export interface SendMessageCommand extends BaseMcpCommand { // <<< export
    type: 'sendMessage';
    message: string;
}

/**
 * 'getStatus' コマンドの型定義
 */
export interface GetStatusCommand extends BaseMcpCommand { // <<< export
    type: 'getStatus';
}


/**
 * 'attackMob' コマンドの型定義
 */
export interface AttackMobCommand extends BaseMcpCommand { // <<< export
    type: 'attackMob';
    targetMobName?: string;
    maxCombatDistance?: number;
    attackRange?: number;
    stopAfterKill?: boolean;
    maxAttempts?: number;
    recheckTargetInterval?: number;
}

/**
 * 'stop' コマンドの型定義
 */
export interface StopCommand extends BaseMcpCommand { // <<< export
    type: 'stop';
}

/**
 * 'connect' コマンドの型定義
 */
export interface ConnectCommand extends BaseMcpCommand { // <<< export
    type: 'connect';
}

/**
 * 'setCombatMode' コマンドの型定義
 */
export interface SetCombatModeCommand extends BaseMcpCommand { // <<< export
    type: 'setCombatMode';
    mode: 'on' | 'off';
}

/**
 * 'setCombatOptions' コマンドの型定義 (新規追加)
 */
export interface SetCombatOptionsCommand extends BaseMcpCommand {
    type: 'setCombatOptions';
    maxCombatDistance?: number;
    attackRange?: number;
}

/**
 * 'setMiningMode' コマンドの型定義
 */
export interface SetMiningModeCommand extends BaseMcpCommand {
    type: 'setMiningMode';
    mode: 'on' | 'off';
    blockName?: string | null;
    blockId?: number | null;
    quantity?: number;
    maxDistance?: number;
}

/**
 * 'setFollowMode' コマンドの型定義
 */
export interface SetFollowModeCommand extends BaseMcpCommand { // <<< export
    type: 'setFollowMode';
    mode: 'on' | 'off';
    targetPlayer?: string;
}

/**
 * 'setBehaviorPriority' コマンドの型定義
 */
export interface SetBehaviorPriorityCommand extends BaseMcpCommand { // <<< export
    type: 'setBehaviorPriority';
    behavior: BehaviorName;
    priority: number;
}

/**
 * 'teleport' コマンドの型定義
 */
export interface TeleportCommand extends BaseMcpCommand { // <<< export
    type: 'teleport';
    x: number;
    y: number;
    z: number;
}


/**
 * MCPサーバーが受け入れる全てのコマンドの結合型
 */
export type McpCommand = // <<< export
    | FollowPlayerCommand
    | SendMessageCommand
    | GetStatusCommand
    | AttackMobCommand
    | StopCommand
    | ConnectCommand
    | SetCombatModeCommand
    | SetCombatOptionsCommand
    | SetMiningModeCommand
    | SetFollowModeCommand
    | SetBehaviorPriorityCommand
    | TeleportCommand;

/**
 * 現在実行中の行動の状態 (BehaviorEngineから返される)
 */
export interface CurrentBehavior { // <<< export
    name: BehaviorName;
    target?: string | number | { x: number, y: number, z: number } | null; // Vec3の代わりに具体的なオブジェクト型
    isActive: boolean;
}

/**
 * MCPサーバーからの基本的な応答構造
 */
export interface BaseMcpResponse { // <<< export
    status: 'success' | 'error' | 'pending';
    commandId?: string;
    message?: string;
    data?: any;
}

/**
 * 成功応答の型定義
 */
export interface SuccessMcpResponse extends BaseMcpResponse { // <<< export
    status: 'success';
    data?: any;
}

/**
 * エラー応答の型定義
 */
export interface ErrorMcpResponse extends BaseMcpResponse { // <<< export
    status: 'error';
    message: string;
    details?: any;
}

/**
 * 処理中応答の型定義 (非同期コマンドの場合など)
 */
export interface PendingMcpResponse extends BaseMcpResponse { // <<< export
    status: 'pending';
    message: string;
}

/**
 * MCPサーバーからの全ての応答の結合型
 */
export type McpResponse = SuccessMcpResponse | ErrorMcpResponse | PendingMcpResponse; // <<< export
