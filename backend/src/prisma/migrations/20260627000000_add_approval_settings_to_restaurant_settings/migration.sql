-- AlterTable: add manual approval threshold and auto-confirm flag to restaurant_settings
ALTER TABLE "restaurant_settings" ADD COLUMN "manualApprovalThreshold" INTEGER;
ALTER TABLE "restaurant_settings" ADD COLUMN "autoConfirm" BOOLEAN NOT NULL DEFAULT false;
