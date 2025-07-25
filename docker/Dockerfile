#ベースイメージ
FROM node:22-slim

# 作業ディレクトリを設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピーし、依存関係をインストール
COPY package*.json ./
RUN npm install

# ソースコードをコピー
COPY . .

# TypeScriptコードをJavaScriptにコンパイル
RUN npm run build # package.jsonに "build": "tsc" が必要

# アプリケーションを実行
CMD ["node", "dist/main.js"]

# MCPサーバーがリッスンするポートを公開 (例: 3000)
EXPOSE 3000
