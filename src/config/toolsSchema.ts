// src/config/toolsSchema.ts (修正後)

/**
 * mcpoに提供するツールの定義（スキーマ）。
 * AIがツールの使い方、特に各引数の意味と期待される値を正確に理解できるよう、
 * 目的、動作、制約を明確に記述する。
 */
export const BOT_TOOLS_SCHEMA = [
  { 
    "name": "minecraft_get_status", 
    "description": "ボットの現在の包括的な状態を取得します。体力、空腹度、現在位置、設定されているモード、実行中および待機中のタスクなどが含まれます。", 
    "inputSchema": { "type": "object", "properties": {}, "required": [] } 
  },
  { 
    "name": "minecraft_stop_behavior", 
    "description": "ボットが現在実行しているすべての行動（採掘、追従、戦闘など）を即座に中断させ、待機状態に戻します。", 
    "inputSchema": { "type": "object", "properties": {}, "required": [] } 
  },
  // ★ここを修正: 採掘モードのON/OFFを制御する形式に変更
  { 
    "name": "minecraft_set_mining_mode", 
    "description": "指定されたブロックを採掘する「採掘モード」のON/OFFを設定します。", 
    "inputSchema": { 
      "type": "object", 
      "properties": { 
        "mode": { 
          "type": "string", 
          "enum": ["on", "off"], 
          "description": "モードを有効にする場合は'on'を、無効にする場合は'off'を指定してください。" 
        },
        "blockName": { "type": "string", "description": "採掘モードを'on'にする場合に必須となる、採掘対象のブロックの英語名です。例: 'stone', 'oak_log'" }, 
        "quantity": { "type": "integer", "description": "採掘モードを'on'にする場合に必須となる、採掘するブロックの個数です。" } 
      }, 
      "required": ["mode"] 
    } 
  },
  { 
    "name": "minecraft_set_follow_mode", 
    "description": "特定のプレイヤーを自動で追いかける「追従モード」のON/OFFを設定します。", 
    "inputSchema": { 
      "type": "object", 
      "properties": { 
        "mode": { 
          "type": "string", 
          "enum": ["on", "off"], 
          "description": "モードを有効にする場合は必ず'on'を、無効にする場合は必ず'off'を指定してください。" 
        }, 
        "targetPlayer": { 
          "type": "string", 
          "description": "追従を開始する場合に必須となる、ターゲットプレイヤーの正確な名前です。" 
        } 
      }, 
      "required": ["mode"] 
    } 
  },
  { 
    "name": "minecraft_set_combat_mode", 
    "description": "周囲の敵対的なモブを自動的に検知し、攻撃する「戦闘モード」のON/OFFを設定します。「警戒して」や「攻撃して」と言われた場合は、このツールを使ってください。", 
    "inputSchema": { 
      "type": "object", 
      "properties": { 
        "mode": { 
          "type": "string", 
          "enum": ["on", "off"], 
          "description": "戦闘モードを有効にする場合は、必ず'on'という文字列を指定してください。無効にする場合は'off'を指定します。'警戒'や'攻撃'のような他の言葉は引数として使用できません。"
        } 
      }, 
      "required": ["mode"] 
    } 
  },
  { 
    "name": "minecraft_set_home", 
    "description": "採掘したアイテムなどを持ち帰るための拠点（ホーム）の座標を設定します。", 
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
