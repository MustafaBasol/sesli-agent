-- CreateTable
CREATE TABLE "menu_categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "allergensJson" JSONB,
    "dietaryTagsJson" JSONB,
    "aliasesJson" JSONB,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_restaurantId_name_key" ON "menu_categories"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "menu_categories_restaurantId_status_idx" ON "menu_categories"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "menu_categories_restaurantId_sortOrder_idx" ON "menu_categories"("restaurantId", "sortOrder");

-- CreateIndex
CREATE INDEX "menu_items_restaurantId_categoryId_idx" ON "menu_items"("restaurantId", "categoryId");

-- CreateIndex
CREATE INDEX "menu_items_restaurantId_status_idx" ON "menu_items"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "menu_items_restaurantId_isAvailable_idx" ON "menu_items"("restaurantId", "isAvailable");

-- CreateIndex
CREATE INDEX "menu_items_restaurantId_sortOrder_idx" ON "menu_items"("restaurantId", "sortOrder");
