########################################
# Docker build
########################################
# cd ~/data/github/minecraft_mcp_server
#time sudo docker build --progress plain -t naisy/pc-node22-slim-minecraft-mcp-dev -f docker/Dockerfile .

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

# patch コマンドのために build-essential をインストール
#RUN apt-get update && \
#    apt-get install -y patch && \
#    rm -rf /var/lib/apt/lists/*

# パッチファイルをコピー
#COPY patches/mineflayer-physics-safe.patch /tmp/physics.patch

# mineflayerのパッチ適用
#RUN patch -p0 -d node_modules/mineflayer < /tmp/physics.patch


# 必要なソースコードと設定ファイルをコピー
COPY src ./src
COPY tsconfig.json ./

# TypeScriptコードをJavaScriptにコンパイル
RUN npm run build # package.jsonに "build": "tsc" が必要

# MCPサーバーがリッスンするポートを公開
EXPOSE 3000

# コンテナ起動時に実行するコマンド
CMD [ "npm", "start" ]
#CMD [ "node", "dist/index.js" ]

# 必要なパッケージをインストール（vim, tree）
#RUN apt update && \
#    apt install -y git vim tree && \
#    rm -rf /var/lib/apt/lists/*

# .vimrc をホームディレクトリに作成
RUN echo "set mouse=" > /root/.vimrc && \
    echo "set encoding=utf-8" >> /root/.vimrc && \
    echo "set fileencodings=utf-8,euc-jp,sjis" >> /root/.vimrc && \
    echo "set fileformats=unix,dos,mac" >> /root/.vimrc

