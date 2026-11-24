import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { changeRoleAction, userStatusAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Input, Select } from "@/components/ui/form";
import { Card, CardHeader, KeyValue, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { bookingStatus, payoutStatus, roleLabel } from "@/lib/labels";
import { formatDate, formatDay, formatINR, maskVpa } from "@/lib/utils";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const u = await db.user.findUnique({
    where: { id: (await params).id },
    include: { role: true, customerProfile: true, addresses: { where: { deletedAt: null } }, upiAccounts: { where: { deletedAt: null } }, bookings: { orderBy: { createdAt: "desc" }, take: 50, include: { slot: true } }, payouts: { orderBy: { createdAt: "desc" }, take: 50, include: { booking: true } }, referredBy: { include: { referrer: true } } },
  });
  if (!u) notFound();
  const paid = u.payouts.filter((p) => p.status === "SUCCESSFUL").reduce((s, p) => s + p.amountPaise, 0);
  return (
    <>
      <Link href="/admin/customers" className="mb-4 inline-flex items-center gap-1 text-sm text-muted"><ArrowLeft className="size-4" /> Customers</Link>
      <PageHeader title={u.name ?? "(no name)"} description={`${roleLabel[u.role.key]} · joined ${formatDate(u.createdAt)} · last login ${formatDate(u.lastLoginAt, true)}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bookings" value={u.bookings.length} />
        <Stat label="Total paid" value={formatINR(paid, { whole: true })} tone="forest" />
        <Stat label="Reward points" value={u.customerProfile?.rewardPoints ?? 0} />
        <Stat label="Status" value={u.status.toLowerCase()} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Booking history" />
            <Table>
              <thead><tr><Th>Booking</Th><Th>Date</Th><Th>Status</Th></tr></thead>
              <tbody>{u.bookings.map((b) => <tr key={b.id}><Td><Link href={`/admin/bookings/${b.id}`} className="num font-medium text-forest">{b.code}</Link></Td><Td>{formatDay(b.pickupDate)}</Td><Td><StatusBadge map={bookingStatus} value={b.status} /></Td></tr>)}</tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Payment history" />
            <Table>
              <thead><tr><Th>Payout</Th><Th>Booking</Th><Th className="text-right">Amount</Th><Th>Status</Th></tr></thead>
              <tbody>{u.payouts.map((p) => <tr key={p.id}><Td><Link href={`/admin/payments/${p.id}`} className="num text-forest">{p.code}</Link></Td><Td className="num">{p.booking.code}</Td><Td className="num text-right">{formatINR(p.amountPaise)}</Td><Td><StatusBadge map={payoutStatus} value={p.status} /></Td></tr>)}</tbody>
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-5">
            <KeyValue items={[
              ["Phone", u.phone ?? "—"],
              ["Email", u.email ?? "—"],
              ["Referral code", u.customerProfile?.referralCode ?? "—"],
              ["Referred by", u.referredBy?.referrer.name ?? "—"],
              ["UPI IDs", u.upiAccounts.map((a) => `${maskVpa(a.vpa)}${a.isPrimary ? " (primary)" : ""}`).join(", ") || "None"],
              ["Marketing opt-in", u.customerProfile?.marketingOptIn ? "Yes" : "No"],
            ]} />
            <div className="mt-4 space-y-1 text-sm">{u.addresses.map((a) => <p key={a.id} className="text-muted">{a.label}: {a.line1}, {a.city} {a.pincode}</p>)}</div>
          </Card>
          <Card>
            <CardHeader title="Account management" />
            <div className="space-y-4 p-5">
              <ActionForm action={userStatusAction} className="space-y-2">
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="status" value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                <Input name="reason" placeholder="Reason (audited)" />
                <SubmitButton variant={u.status === "ACTIVE" ? "danger" : "primary"} size="sm">{u.status === "ACTIVE" ? "Suspend account" : "Reactivate account"}</SubmitButton>
              </ActionForm>
              {me.role === "SUPER_ADMIN" && (
                <ActionForm action={changeRoleAction} className="flex gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <Select name="role" defaultValue={u.role.key}>{Object.entries(roleLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                  <SubmitButton variant="secondary" size="sm">Change role</SubmitButton>
                </ActionForm>
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
