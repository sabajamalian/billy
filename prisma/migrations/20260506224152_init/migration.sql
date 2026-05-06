-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shareToken" TEXT NOT NULL,
    "hostTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCANNING',
    "imagePath" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "tipInputType" TEXT NOT NULL DEFAULT 'FLAT',
    "tipInputValue" REAL NOT NULL DEFAULT 0,
    "tipResolvedCents" INTEGER NOT NULL DEFAULT 0,
    "acceptedMismatch" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL DEFAULT 1.0,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Item_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OcrRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "rawJson" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "costUsd" REAL,
    "error" TEXT,
    "imageHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OcrRun_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Bill_shareToken_key" ON "Bill"("shareToken");

-- CreateIndex
CREATE INDEX "Bill_shareToken_idx" ON "Bill"("shareToken");

-- CreateIndex
CREATE INDEX "Bill_expiresAt_idx" ON "Bill"("expiresAt");

-- CreateIndex
CREATE INDEX "Item_billId_idx" ON "Item"("billId");

-- CreateIndex
CREATE INDEX "OcrRun_billId_idx" ON "OcrRun"("billId");

-- CreateIndex
CREATE INDEX "OcrRun_imageHash_idx" ON "OcrRun"("imageHash");
