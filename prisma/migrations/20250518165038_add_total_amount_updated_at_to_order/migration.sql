/*
  Warnings:

  - Added the required column `totalAmount` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'paid';
ALTER TYPE "OrderStatus" ADD VALUE 'failed';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "currency" TEXT DEFAULT 'EGP',
ADD COLUMN "paymobOrderId" TEXT,
ADD COLUMN "paymobTransactionId" TEXT,
ADD COLUMN "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now();


-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
