# minecraft_mcp_server
minecraft mcp server

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
