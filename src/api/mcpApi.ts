// src/api/mcpApi.ts

import express from 'express';
import { Request, Response } from 'express';
import { CommandHandler } from '../services/CommandHandler';
import { McpCommand, McpResponse } from '../types/mcp'; // 型定義をインポート

/**
 * MCPサーバーのAPIエンドポイントを提供するクラス
 */
export class McpApi {
    private app: express.Application;
    private port: number;
    private commandHandler: CommandHandler;

    constructor(commandHandler: CommandHandler, port: number = 3000) {
        this.app = express();
        this.port = port;
        this.commandHandler = commandHandler;

        this.setupMiddleware();
        this.setupRoutes();
        console.log(`MCP API initialized. Listening on port ${this.port}`);
    }

    /**
     * Expressミドルウェアを設定します。
     */
    private setupMiddleware(): void {
        this.app.use(express.json()); // JSON形式のリクエストボディをパースする
        // CORS設定など、必要に応じて追加
    }

    /**
     * APIルートを設定します。
     */
    private setupRoutes(): void {
        // コマンド処理のエンドポイント
        this.app.post('/command', async (req: Request, res: Response) => {
            const command: McpCommand = req.body;
            console.log(`Received command via API: ${JSON.stringify(command)}`);

            // コマンドのバリデーション（簡易的な例）
            if (!command || !command.type) {
                return res.status(400).json({
                    status: 'error',
                    message: 'Invalid command format. "type" field is required.'
                } as McpResponse);
            }

            try {
                // CommandHandlerに処理を委譲
                const response = await this.commandHandler.handleCommand(command);
                res.json(response); // 応答をLLMに返す
            } catch (error: any) {
                console.error('Error in API route /command:', error);
                res.status(500).json({
                    status: 'error',
                    message: `Internal server error: ${error.message || 'Unknown error'}`,
                    details: error
                } as McpResponse);
            }
        });

        // ヘルスチェックエンドポイント
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({ status: 'ok', message: 'MCP API is running.' });
        });
    }

    /**
     * APIサーバーを起動します。
     */
    public start(): void {
        this.app.listen(this.port, () => {
            console.log(`MCP API server listening on http://localhost:${this.port}`);
        });
    }
}
