#!/bin/sh
set -e

mkdir -p /app/data/uploads
npx prisma db push
exec node server.js
