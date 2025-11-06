/*
  Warnings:

  - The primary key for the `room_amenities` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `amenity_id` on the `room_amenities` table. All the data in the column will be lost.
  - You are about to drop the `amenities` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[name]` on the table `room_amenities` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `room_amenities` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `name` to the `room_amenities` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."room_amenities" DROP CONSTRAINT "room_amenities_amenity_id_fkey";

-- AlterTable
ALTER TABLE "room_amenities" DROP CONSTRAINT "room_amenities_pkey",
DROP COLUMN "amenity_id",
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD CONSTRAINT "room_amenities_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "public"."amenities";

-- CreateIndex
CREATE UNIQUE INDEX "room_amenities_name_key" ON "room_amenities"("name");
