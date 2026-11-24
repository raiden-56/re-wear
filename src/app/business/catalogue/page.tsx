import Image from "next/image";
import { redirect } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { businessPrice, visibleListings } from "@/server/services/b2b";
import { requestPurchaseAction } from "@/app/actions/partners";
import { ActionForm, FieldError, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { gradeLabel } from "@/lib/labels";
import { formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "Bulk catalogue" };

export default async function Catalogue({ searchParams }: { searchParams: Promise<{ grade?: string; category?: string }> }) {
  const user = await requireRole(["B2B_BUYER"]);
  const sp = await searchParams;
  const biz = await db.businessProfile.findUnique({ where: { userId: user.id } });
  if (!biz) redirect("/partners/register?type=business");
  const all = await visibleListings(biz.businessType);
  const listings = all.filter((l) => (!sp.grade || l.grade === sp.grade) && (!sp.category || l.categoryId === sp.category));
  const categories = [...new Map(all.map((l) => [l.categoryId, l.category])).values()];
  const verified = biz.verificationStatus === "VERIFIED";
  return (
    <>
      <PageHeader title="Bulk catalogue" description="Graded, weighed stock. Prices shown include your partner discount." />
      <form className="mb-5 flex flex-wrap gap-2">
        <Select name="grade" defaultValue={sp.grade ?? ""} className="h-10 w-52" aria-label="Grade"><option value="">All grades</option>{["PREMIUM_REUSABLE", "STANDARD_REUSABLE", "REPAIRABLE", "RECYCLABLE", "UPCYCLING"].map((g) => <option key={g} value={g}>{gradeLabel[g].label}</option>)}</Select>
        <Select name="category" defaultValue={sp.category ?? ""} className="h-10 w-52" aria-label="Category"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <SubmitButton variant="secondary">Filter</SubmitButton>
      </form>
      {listings.length === 0 ? <EmptyState icon={PackageSearch} title="No stock matches" description="New lots are graded every day." /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {listings.map((l) => {
            const price = businessPrice(l.pricePerKgPaise, biz.discountBps);
            const avail = l.availableGrams - l.reservedGrams;
            return (
              <Card key={l.id} className="overflow-hidden">
                <div className="flex gap-4 p-5">
                  {l.photoUrls[0] && <div className="relative size-24 shrink-0 overflow-hidden rounded-xl"><Image src={l.photoUrls[0]} alt="" fill sizes="96px" className="object-cover" /></div>}
                  <div className="min-w-0 flex-1">
                    <StatusBadge map={gradeLabel} value={l.grade} />
                    <h3 className="mt-1.5 font-semibold">{l.title}</h3>
                    {l.description && <p className="mt-1 text-sm text-muted">{l.description}</p>}
                    <div className="num mt-2 flex flex-wrap gap-x-4 text-sm"><span className="font-display text-lg font-bold">{formatINR(price)}/kg</span>{biz.discountBps > 0 && <span className="text-muted line-through">{formatINR(l.pricePerKgPaise)}</span>}<span className="text-muted">{formatKg(avail, 0)} available · MOQ {formatKg(l.minOrderGrams, 0)}</span></div>
                  </div>
                </div>
                <details className="border-t border-line px-5 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-forest">{verified ? "Request this stock" : "Available after verification"}</summary>
                  {verified && (
                    <ActionForm action={requestPurchaseAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="listingId" value={l.id} />
                      <Field label={`Quantity (kg, min ${l.minOrderGrams / 1000})`}><Input name="kg" type="number" min={l.minOrderGrams / 1000} max={avail / 1000} defaultValue={l.minOrderGrams / 1000} /><FieldError name="kg" /></Field>
                      <Field label="Your offer ₹/kg (optional)" hint="Leave blank to accept your price"><Input name="offeredPrice" type="number" step="0.5" /></Field>
                      <Field label="Delivery address" className="sm:col-span-2"><Input name="deliveryAddress" defaultValue={`${biz.addressLine ?? ""}, ${biz.city ?? ""} ${biz.pincode ?? ""}`} /><FieldError name="deliveryAddress" /></Field>
                      <Field label="Message" className="sm:col-span-2"><Textarea name="message" rows={2} /></Field>
                      <SubmitButton>Send purchase request</SubmitButton>
                    </ActionForm>
                  )}
                </details>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
