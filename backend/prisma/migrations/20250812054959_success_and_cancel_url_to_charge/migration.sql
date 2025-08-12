-- AlterTable
ALTER TABLE "public"."Charge" ADD COLUMN     "cancel_url" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "success_url" TEXT;
