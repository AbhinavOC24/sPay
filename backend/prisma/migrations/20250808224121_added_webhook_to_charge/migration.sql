/*
  Warnings:

  - Added the required column `webhook` to the `Charge` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Charge" ADD COLUMN     "webhook" TEXT NOT NULL;
