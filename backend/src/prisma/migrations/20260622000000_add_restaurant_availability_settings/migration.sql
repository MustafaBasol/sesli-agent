-- CreateTable
CREATE TABLE "restaurant_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "reservationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "openingHoursJson" JSONB,
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "defaultReservationDurationMinutes" INTEGER NOT NULL DEFAULT 90,
    "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 60,
    "bookingWindowDays" INTEGER NOT NULL DEFAULT 30,
    "minPartySize" INTEGER NOT NULL DEFAULT 1,
    "maxPartySize" INTEGER NOT NULL DEFAULT 12,
    "maxReservationsPerSlot" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blackout_dates" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "startsAtLocal" TEXT,
    "endsAtLocal" TEXT,
    "isFullDay" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blackout_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_settings_restaurantId_key" ON "restaurant_settings"("restaurantId");

-- CreateIndex
CREATE INDEX "blackout_dates_restaurantId_localDate_idx" ON "blackout_dates"("restaurantId", "localDate");
