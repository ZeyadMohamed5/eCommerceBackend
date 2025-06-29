-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponDescription" TEXT,
ADD COLUMN     "couponPercentage" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discountApplied" DECIMAL(5,2),
ADD COLUMN     "discountId" INTEGER;
