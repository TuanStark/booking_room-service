-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'MAINTENANCE', 'DISABLED');

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "status" "RoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_images" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_public_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amenities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_amenities" (
    "roomId" TEXT NOT NULL,
    "amenity_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "room_amenities_pkey" PRIMARY KEY ("roomId","amenity_id")
);

-- CreateIndex
CREATE INDEX "rooms_building_id_idx" ON "rooms"("building_id");

-- CreateIndex
CREATE INDEX "room_images_room_id_idx" ON "room_images"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "amenities_name_key" ON "amenities"("name");

-- AddForeignKey
ALTER TABLE "room_images" ADD CONSTRAINT "room_images_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_amenities" ADD CONSTRAINT "room_amenities_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
