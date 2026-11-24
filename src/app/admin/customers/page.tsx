import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/primitives";
import { formatDate, formatINR, maskPhone } from "@/lib/utils";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; city?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const sp = await searchParams;
  const where: Prisma.UserWhereInput = {
    role: { key: "CUSTOMER" },
    deletedAt: null,
    ...(sp.status ? { status: sp.status as never } : {}),
    ...(sp.city ? { addresses: { some: { city: sp.city } } } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }, { email: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [users, total] = await Promise.all([
    db.user.findMany({ where, include: { customerProfile: true, _count: { select: { bookings: true } }, payouts: { where: { status: "SUCCESSFUL" }, select: { amountPaise: true } }, addresses: { where: { isDefault: true }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.user.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Customers" description={`${total} customers`} />
      <form className="mb-4 grid gap-2 sm:grid-cols-5">
        <Input name="q" defaultValue={sp.q} placeholder="Name, phone or email" className="h-10 sm:col-span-2" aria-label="Search" />
        <Select name="status" defaultValue={sp.status ?? ""} className="h-10" aria-label="Status"><option value="">Any status</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></Select>
        <Input name="city" defaultValue={sp.city} placeholder="City" className="h-10" aria-label="City" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card>
        <Table>
          <thead><tr><Th>Customer</Th><Th>Phone</Th><Th>City</Th><Th className="text-right">Bookings</Th><Th className="text-right">Paid</Th><Th className="text-right">Points</Th><Th>Joined</Th><Th>Status</Th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-cream/40">
                <Td><Link href={`/admin/customers/${u.id}`} className="font-medium text-forest hover:underline">{u.name ?? "(no name)"}</Link><div className="text-xs text-muted">{u.email}</div></Td>
                <Td className="num text-sm">{maskPhone(u.phone)}</Td>
                <Td className="text-sm">{u.addresses[0]?.city ?? "—"}</Td>
                <Td className="num text-right">{u._count.bookings}</Td>
                <Td className="num text-right">{formatINR(u.payouts.reduce((s, p) => s + p.amountPaise, 0), { whole: true })}</Td>
                <Td className="num text-right">{u.customerProfile?.rewardPoints ?? 0}</Td>
                <Td className="text-xs text-muted">{formatDate(u.createdAt)}</Td>
                <Td><Badge tone={u.status === "ACTIVE" ? "green" : "red"}>{u.status.toLowerCase()}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
