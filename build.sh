docker rmi my-minecraft-bot
docker builder prune --force
docker build -t my-minecraft-bot -f docker/Dockerfile .
