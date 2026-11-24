import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CalendarDays, List } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { assignAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Card, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/primitives";
import { addDays, dayToDate, todayIST } from "@/lib/dates";
import { bookingStatus, channelLabel } from "@/lib/labels";
import { formatDay, formatINR, formatKg } from "@/lib/utils";

export const metadata = { title: "Bookings" };

export default async function AdminBookings({ searchParams }: { searchParams: Promise<{ status?: string; city?: string; from?: string; to?: string; q?: string; view?: string; collector?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : "list";
  const where: Prisma.BookingWhereInput = {
    ...(sp.status ? { status: sp.status as never } : {}),
    ...(sp.city ? { serviceArea: { city: sp.city } } : {}),
    ...(sp.collector ? { assignments: { some: { collectorId: sp.collector, active: true } } } : {}),
    ...(sp.q ? { OR: [{ code: { contains: sp.q, mode: "insensitive" } }, { customer: { name: { contains: sp.q, mode: "insensitive" } } }, { customer: { phone: { contains: sp.q } } }] } : {}),
    pickupDate: { gte: sp.from ? dayToDate(sp.from) : view === "calendar" ? dayToDate(todayIST()) : undefined, lte: sp.to ? dayToDate(sp.to) : view === "calendar" ? dayToDate(addDays(todayIST(), 6)) : undefined },
  };
  const [bookings, cities, collectors] = await Promise.all([
    db.booking.findMany({ where, include: { customer: true, slot: true, serviceArea: true, assignments: { where: { active: true }, include: { collector: { include: { user: true } } } }, valuations: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 } }, orderBy: [{ pickupDate: view === "calendar" ? "asc" : "desc" }, { createdAt: "desc" }], take: 300 }),
    db.serviceArea.findMany({ distinct: ["city"], select: { city: true } }),
    db.collectorProfile.findMany({ where: { active: true }, include: { user: true } }),
  ]);
  const qs = (o: Record<string, string>) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), ...o } as Record<string, string>).toString();

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Assign collectors, manage status and track every pickup."
        actions={<div className="flex rounded-full bg-white p-1 ring-1 ring-line"><Button asChild size="sm" variant={view === "list" ? "primary" : "ghost"}><Link href={qs({ view: "list" })}><List /> List</Link></Button><Button asChild size="sm" variant={view === "calendar" ? "primary" : "ghost"}><Link href={qs({ view: "calendar" })}><CalendarDays /> Calendar</Link></Button></div>}
      />
      <form className="mb-4 grid gap-2 sm:grid-cols-7">
        <input type="hidden" name="view" value={view} />
        <Input name="q" defaultValue={sp.q} placeholder="Code, name, phone" className="h-10 sm:col-span-2" aria-label="Search" />
        <Select name="status" defaultValue={sp.status ?? ""} className="h-10" aria-label="Status"><option value="">All statuses</option>{Object.entries(bookingStatus).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Select name="city" defaultValue={sp.city ?? ""} className="h-10" aria-label="City"><option value="">All cities</option>{cities.map((c) => <option key={c.city}>{c.city}</option>)}</Select>
        <Input type="date" name="from" defaultValue={sp.from} className="h-10" aria-label="From" />
        <Input type="date" name="to" defaultValue={sp.to} className="h-10" aria-label="To" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {view === "calendar" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 7 }, (_, i) => addDays(sp.from ?? todayIST(), i)).map((d) => {
            const list = bookings.filter((b) => b.pickupDate.toISOString().slice(0, 10) === d);
            return (
              <Card key={d} className="p-3">
                <div className="mb-2 flex justify-between text-sm font-semibold"><span>{formatDay(dayToDate(d))}</span><span className="num text-muted">{list.length}</span></div>
                <ul className="space-y-1.5">
                  {list.map((b) => (
                    <li key={b.id}><Link href={`/admin/bookings/${b.id}`} className="block rounded-lg bg-cream px-2.5 py-1.5 text-xs hover:bg-cream-200"><div className="flex justify-between gap-2"><span className="font-medium">{b.slot.label}</span><StatusBadge map={bookingStatus} value={b.status} /></div><div className="mt-0.5 truncate text-muted">{b.serviceArea.zone} · {b.assignments[0]?.collector.user.name ?? "Unassigned"}</div></Link></li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <thead><tr><Th>Booking</Th><Th>Customer</Th><Th>Pickup</Th><Th>Area</Th><Th>Collector</Th><Th className="text-right">Value</Th><Th>Status</Th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-cream/40">
                  <Td><Link href={`/admin/bookings/${b.id}`} className="num font-semibold text-forest hover:underline">{b.code}</Link><div className="text-xs text-muted">{channelLabel[b.channel]}</div></Td>
                  <Td>{b.customer.name ?? "—"}</Td>
                  <Td className="text-sm">{formatDay(b.pickupDate)}<div className="text-xs text-muted">{b.slot.label}</div></Td>
                  <Td className="text-sm">{b.serviceArea.city}<div className="text-xs text-muted">{b.serviceArea.zone}</div></Td>
                  <Td>
                    {b.assignments[0] ? <span className="text-sm">{b.assignments[0].collector.user.name}</span> : b.status === "SCHEDULED" ? (
                      <ActionForm action={assignAction} className="flex gap-1">
                        <input type="hidden" name="bookingId" value={b.id} />
                        <Select name="collectorId" className="h-8 w-36 text-xs" aria-label="Collector">{collectors.filter((c) => c.serviceAreaId === b.serviceAreaId).map((c) => <option key={c.id} value={c.id}>{c.user.name}</option>)}</Select>
                        <SubmitButton size="sm">Assign</SubmitButton>
                      </ActionForm>
                    ) : <span className="text-xs text-muted">—</span>}
                  </Td>
                  <Td className="num text-right text-sm">{b.valuations[0] ? formatINR(b.valuations[0].payablePaise) : <span className="text-muted">~{formatKg(b.estimatedGrams, 0)}</span>}</Td>
                  <Td><StatusBadge map={bookingStatus} value={b.status} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {bookings.length === 300 && <p className="px-5 py-3 text-xs text-muted">Showing the first 300 — refine filters or export from Reports.</p>}
        </Card>
      )}
    </>
  );
}
