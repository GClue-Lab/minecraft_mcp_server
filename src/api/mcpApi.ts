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
