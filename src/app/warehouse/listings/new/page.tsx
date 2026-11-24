import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Card, Notice, PageHeader } from "@/components/ui/primitives";
import { ListingForm } from "@/components/warehouse/listing-form";

export const metadata = { title: "New listing" };

export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ itemId?: string }> }) {
  await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"]);
  const { itemId } = await searchParams;
  const item = itemId ? await db.inventoryItem.findUnique({ where: { id: itemId }, include: { product: true } }) : null;
  if (!item || item.kind !== "UNIT") notFound();
  const categories = await db.clothingCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return (
    <>
      <PageHeader title="Create resale listing" description={`From garment ${item.code}`} />
      {!item.inspectionPassed && <Notice tone="warn" className="mb-4">This garment has not passed premium inspection — you can save a draft, but it can't be published.</Notice>}
      {item.product ? <Notice tone="info">This garment is already listed.</Notice> : <Card className="max-w-3xl p-6"><ListingForm item={item} categories={categories} /></Card>}
    </>
  );
}
