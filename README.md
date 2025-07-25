# minecraft_mcp_server
minecraft mcp server

周辺状況の確認
```
curl -X POST -H "Content-Type: application/json" \
     -d '{ "type": "getStatus", "id": "test-status-123" }' \
     http://192.168.1.25:3000/command
```


プレイヤーを追従する
```
curl -X POST -H "Content-Type: application/json" \
     -d '{ "type": "followPlayer", "targetPlayer": "YourMinecraftPlayer", "id": "test-follow-behavior" }' \
     http://localhost:3000/command
```

```
curl -X POST -H "Content-Type: application/json" \
     -d '{ "type": "followPlayer", "targetPlayer": "naisy714", "id": "test-follow-behavior" }' \
     http://192.168.1.25:3000/command
```


石を採掘する
```
curl -X POST -H "Content-Type: application/json" \
     -d '{ "type": "mineBlock", "blockId": 1, "quantity": 1, "id": "mine-stone-one" }' \
     http://192.168.1.45:3000/command
```

```
git clone https://github.com/GClue-Lab/minecraft_mcp_server
cd minecraft_mcp_server

npm install
npm run build

export MINECRAFT_SERVER_HOST="<あなたのMinecraftサーバーのIPアドレス>"
export MINECRAFT_SERVER_PORT="<あなたのMinecraftサーバーのポート>"
export BOT_USERNAME="MCP_CLI_Bot"
export MCP_SERVER_PORT="3000"

npm start
```

```
mcp-server/
├── src/
│   ├── main.ts                     # サーバーのエントリーポイント、初期化処理
│   ├── config/                     # 設定ファイル関連
│   │   └── index.ts                # 設定の読み込みと管理
│   │   └── default.ts              # デフォルト設定
│   ├── services/                   # 主要なサービスロジック
│   │   ├── BotManager.ts           # Mineflayerボットのライフサイクル管理（接続、切断、再接続、エラーハンドリング）
│   │   ├── CommandHandler.ts       # LLMからのMCPコマンド解釈と実行
│   │   ├── WorldKnowledge.ts       # Minecraftワールドの状態管理（地形、エンティティ、ブロックなど）
│   │   └── BehaviorEngine.ts       # 高レベルな行動ロジック（追従、採掘、戦闘など）
│   ├── behaviors/                  # 高レベルな行動の定義
│   │   ├── followPlayer.ts         # プレイヤー追従行動
│   │   ├── exploreArea.ts          # エリア探索行動
│   │   └── combatEnemy.ts          # 敵対エンティティとの戦闘行動
│   ├── utils/                      # 汎用ユーティリティ関数
│   │   ├── pathfindingUtils.ts     # 経路探索関連ユーティリティ
│   │   └── logger.ts               # ロギングユーティリティ
│   ├── api/                        # MCPのAPIエンドポイント定義
│   │   └── mcpApi.ts               # MCPコマンドの受信と`CommandHandler`への連携
│   ├── types/                      # TypeScriptの型定義ファイル
│   │   └── mcp.d.ts                # MCPコマンド、ボットの状態など、プロジェクト固有の型定義
│   │   └── mineflayer-extensions.d.ts # Mineflayerプラグインなどで拡張される型の定義
│   └── models/                     # データモデルの定義（必要であれば）
│       └── BotState.ts             # ボットの状態を表すデータモデル
├── docker/
│   ├── Dockerfile                  # Dockerイメージ構築のための定義ファイル
│   └── docker-compose.yml          # 複数コンテナのオーケストレーション定義ファイル (オプション)
├── tests/                          # テストファイル
├── node_modules/                   # 依存関係
├── .env.example                    # 環境変数の例
├── package.json
├── package-lock.json
├── tsconfig.json                   # TypeScriptコンパイラの設定ファイル
└── README.md
```
