/*
  Warnings:

  - You are about to drop the column `customerEmail` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `customerName` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `customerPhone` on the `Order` table. All the data in the column will be lost.
  - Added the required column `address` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firstName` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mobileNumber` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "customerEmail",
DROP COLUMN "customerName",
DROP COLUMN "customerPhone",
ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "anotherAddress" TEXT,
ADD COLUMN     "anotherMobile" TEXT,
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "mobileNumber" TEXT NOT NULL;
