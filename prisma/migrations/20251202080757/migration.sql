/*
  Warnings:

  - A unique constraint covering the columns `[name,region_id]` on the table `Region_item` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Region_item_name_region_id_key" ON "Region_item"("name", "region_id");
