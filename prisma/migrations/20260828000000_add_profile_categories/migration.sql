-- AlterTable
ALTER TABLE "public"."profiles" ADD COLUMN     "categories" "public"."Category"[] DEFAULT ARRAY[]::"public"."Category"[];

-- CreateIndex
CREATE INDEX "profiles_categories_idx" ON "public"."profiles"("categories" ASC);
