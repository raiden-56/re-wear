import { MapPin, Trash2 } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { deleteAddressAction } from "@/app/actions/customer";
import { ActionButton } from "@/components/forms/action-form";
import { AddressEditor } from "@/components/customer/address-editor";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";

export const metadata = { title: "Addresses" };

export default async function AddressesPage() {
  const user = await requireRole(["CUSTOMER"]);
  const addresses = await db.address.findMany({ where: { userId: user.id, deletedAt: null }, include: { serviceArea: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  return (
    <>
      <PageHeader title="Addresses" description="Where should we pick up? We'll tell you if a pincode is serviceable." />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          {addresses.length === 0 && <EmptyState icon={MapPin} title="No addresses yet" description="Add your first pickup address." />}
          {addresses.map((a) => (
            <Card key={a.id} className="flex items-start justify-between gap-4 p-4">
              <div>
                <div className="flex items-center gap-2 font-semibold">{a.label}{a.isDefault && <Badge tone="green">Default</Badge>}{a.serviceArea ? <Badge tone="sage">Serviceable · {a.serviceArea.zone}</Badge> : <Badge tone="red">Not serviceable yet</Badge>}</div>
                <p className="mt-1 text-sm text-muted">{a.contactName} · {a.contactPhone}</p>
                <p className="text-sm">{a.line1}{a.line2 ? `, ${a.line2}` : ""}{a.landmark ? ` (near ${a.landmark})` : ""}, {a.city}, {a.state} {a.pincode}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <AddressEditor address={{ id: a.id, label: a.label, contactName: a.contactName, contactPhone: a.contactPhone, line1: a.line1, line2: a.line2 ?? "", landmark: a.landmark ?? "", city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault }} />
                <ActionButton action={deleteAddressAction} fields={{ id: a.id }} variant="ghost" confirm="Remove this address?"><Trash2 /></ActionButton>
              </div>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader title="Add an address" />
          <div className="p-5"><AddressEditor inline /></div>
        </Card>
      </div>
    </>
  );
}
