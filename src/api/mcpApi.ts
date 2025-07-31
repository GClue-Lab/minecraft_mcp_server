// src/api/mcpApi.ts (修正版)

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
        this.app.get('/', (req, res) => {
            res.status(200).json({ status: 'ok', message: 'Minecraft MCP Server is running.' });
        });

        this.app.post('/command', async (req, res) => {
            const command = req.body as McpCommand;
            if (!command || !command.type) {
                return res.status(400).json({ status: 'error', message: 'Invalid command format.' });
            }

            // ===== ここから変換ロジック =====
            let toolName: string = '';
            let args: any = {};

            switch (command.type) {
                case 'setMiningMode':
                    toolName = 'add_task';
                    args = {
                        taskType: 'mine',
                        arguments: {
                            blockName: command.blockName,
                            quantity: command.quantity
                        }
                    };
                    break;
                
                case 'setFollowMode':
                    if (command.mode === 'on') {
                        toolName = 'add_task';
                        args = {
                            taskType: 'follow',
                            arguments: {
                                targetPlayer: command.targetPlayer
                            }
                        };
                    } else {
                        // followの停止は、特定のタスクIDをキャンセルする必要があるため、
                        // このAPIからは直接的には難しい。stopコマンドを使用するよう促す。
                        // 将来的にはfollowタスクのIDを返すようにするなどの改善が可能。
                        toolName = 'stop_current_task';
                    }
                    break;

                case 'setCombatMode':
                     toolName = 'add_task';
                     args = {
                         taskType: 'combat',
                         arguments: {
                             // 将来的に詳細な引数を追加できる
                         },
                         priority: 0 // 戦闘は最優先
                     };
                    break;

                case 'stop':
                    toolName = 'stop_current_task';
                    break;

                case 'getStatus':
                    toolName = 'get_full_status';
                    break;

                default:
                    return res.status(400).json({ status: 'error', message: `Unknown command type: ${command.type}` });
            }
            // ===== ここまで変換ロジック =====

            try {
                // 修正: handleToolCallを呼び出す
                const result = await this.commandHandler.handleToolCall(toolName, args);
                
                // 成功時のレスポンスを統一
                res.status(200).json({ status: 'success', data: result });

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
