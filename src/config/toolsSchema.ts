// src/config/toolsSchema.ts (新規作成)

/**
 * mcpoに提供するツールの定義（スキーマ）。
 * AIがツールの使い方を正確に理解できるよう、特に引数の説明は詳細に記述する。
 */
export const BOT_TOOLS_SCHEMA = [
  { 
    "name": "minecraft_get_status", 
    "description": "ボットの現在の体力、空腹度、位置、モード設定、タスク状況などを取得する。", 
    "inputSchema": { "type": "object", "properties": {}, "required": [] } 
  },
  { 
    "name": "minecraft_stop_behavior", 
    "description": "ボットが現在実行しているすべての行動を即座に停止させる。", 
    "inputSchema": { "type": "object", "properties": {}, "required": [] } 
  },
  { 
    "name": "minecraft_set_mining_mode", 
    "description": "ボットに特定のブロックを指定した数量だけ採掘するタスクを追加する。", 
    "inputSchema": { 
      "type": "object", 
      "properties": { 
        "blockName": { "type": "string", "description": "採掘するブロックの英語名 (例: 'stone', 'oak_log')" }, 
        "quantity": { "type": "integer", "description": "採掘する数量" } 
      }, 
      "required": ["blockName", "quantity"] 
    } 
  },
  { 
    "name": "minecraft_set_follow_mode", 
    "description": "ボットに特定のプレイヤーを追従させるモードのON/OFFを切り替える。", 
    "inputSchema": { 
      "type": "object", 
      "properties": { 
        "mode": { 
          "type": "string", 
          "enum": ["on", "off"], 
          "description": "追従を開始する場合は'on', 停止する場合は'off'を指定します。" 
        }, 
        "targetPlayer": { 
          "type": "string", 
          "description": "追従を開始する場合に必須となる、ターゲットプレイヤー名。" 
        } 
      }, 
      "required": ["mode"] 
    } 
  },
  { 
    "name": "minecraft_set_combat_mode", 
    "description": "ボットが周囲の敵を自動的に攻撃する戦闘モードのON/OFFを切り替える。", 
    "inputSchema": { 
      "type": "object", 
      "properties": { 
        "mode": { 
          "type": "string", 
          "enum": ["on", "off"], 
          "description": "戦闘モードを有効にする場合は'on', 無効にする場合は'off'を指定してください。'警戒'や'攻撃'のような他の言葉は使えません。" 
        } 
      }, 
      "required": ["mode"] 
    } 
  },
  { 
    "name": "minecraft_set_home", 
    "description": "ボットの拠点（ホーム）の座標を設定する。", 
    "inputSchema": { 
      "type": "object", 
      "properties": { 
        "position": { 
          "type": "object", 
          "properties": { 
            "x": { "type": "number" }, 
            "y": { "type": "number" }, 
            "z": { "type": "number" } 
          }, 
          "required": ["x", "y", "z"] 
        } 
      }, 
      "required": ["position"] 
    } 
  }
];
