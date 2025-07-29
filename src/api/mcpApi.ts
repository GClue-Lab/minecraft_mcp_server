// src/api/mcpApi.ts v1.5 (最終修正版)

import express from 'express';
import bodyParser from 'body-parser';
import { CommandHandler } from '../services/CommandHandler';
import { McpCommand } from '../types/mcp';

export class McpApi {
    private app: express.Express;
    private commandHandler: CommandHandler;
    private port: number;

    constructor(commandHandler: CommandHandler, port: number) {
        this.app = express();
        this.commandHandler = commandHandler;
        this.port = port;
        this.configureMiddleware();
        this.configureRoutes();
        console.log(`MCP API initialized. Listening on port ${port}`);
    }

    private configureMiddleware(): void {
        this.app.use(bodyParser.json());
    }

    private configureRoutes(): void {
        /**
         * GET /
         * mcpoからのヘルスチェック及びSSE接続要求に応答するためのエンドポイント
         */
        this.app.get('/', (req, res) => {
            // SSEの接続要求に対して、正しいヘッダーを返すように修正
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });
            res.flushHeaders();

            // 接続が確立したことを示すためのコメント行を送信
            res.write(': sse connection established\n\n');

            // クライアントが接続を切断した際の処理
            req.on('close', () => {
                console.log('Client closed SSE connection.');
                res.end();
            });
        });

        /**
         * POST /command
         * MCPコマンドを受け取り、CommandHandlerに渡すメインのエンドポイント
         */
        this.app.post('/command', async (req, res) => {
            const command = req.body as McpCommand;
            if (!command || !command.type) {
                return res.status(400).json({ status: 'error', message: 'Invalid command format.' });
            }
            try {
                const response = await this.commandHandler.handleCommand(command);
                res.status(response.status === 'success' ? 200 : 500).json(response);
            } catch (error: any) {
                res.status(500).json({ status: 'error', message: 'An unexpected error occurred.', details: error.message });
            }
        });
    }

    public start(): void {
        this.app.listen(this.port, () => {
            console.log(`MCP API server started on port ${this.port}`);
        });
    }
}
