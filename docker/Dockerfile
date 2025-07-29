#ベースイメージ
FROM node:22-slim

# 作業ディレクトリを設定
WORKDIR /app

# 環境変数を設定
# これらはdocker run時に-eオプションで上書き可能
ENV MINECRAFT_SERVER_HOST=localhost
ENV MINECRAFT_SERVER_PORT=25565
ENV BOT_USERNAME=MCP_Bot
ENV MCP_SERVER_PORT=3000

# package.jsonとpackage-lock.jsonをコピーし、依存関係をインストール
COPY package*.json ./
RUN npm install

# ソースコードをコピー
COPY . .

# TypeScriptコードをJavaScriptにコンパイル
RUN npm run build # package.jsonに "build": "tsc" が必要

# MCPサーバーがリッスンするポートを公開
EXPOSE 3000

# コンテナ起動時に実行するコマンド
CMD [ "npm", "start" ]
