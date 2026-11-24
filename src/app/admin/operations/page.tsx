import { Trash2 } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { blackoutAction, createStaffAction, removeBlackoutAction, saveAreaAction, saveSlotAction, saveWarehouseAction, updateCollectorAction } from "@/app/actions/admin";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Badge, Card, CardHeader, Notice, PageHeader, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { addDays, dayToDate, todayIST } from "@/lib/dates";
import { formatDay, formatINR } from "@/lib/utils";

export const metadata = { title: "Pickup operations" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const tab = (await searchParams).tab ?? "areas";
  const today = todayIST();
  const [areas, collectors, blackouts, warehouses, load] = await Promise.all([
    db.serviceArea.findMany({ include: { slots: { orderBy: { startTime: "asc" } }, _count: { select: { collectors: true } } }, orderBy: [{ city: "asc" }, { zone: "asc" }] }),
    db.collectorProfile.findMany({ include: { user: true, serviceArea: true }, orderBy: { createdAt: "asc" } }),
    db.slotBlackout.findMany({ where: { date: { gte: dayToDate(today) } }, orderBy: { date: "asc" } }),
    db.warehouseLocation.findMany({ orderBy: { code: "asc" } }),
    db.booking.groupBy({ by: ["serviceAreaId", "pickupDate"], where: { pickupDate: { gte: dayToDate(today), lte: dayToDate(addDays(today, 6)) }, status: { notIn: ["CANCELLED", "FAILED"] } }, _count: true }),
  ]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const tabs = [["areas", "Service areas & slots"], ["capacity", "Capacity planning"], ["collectors", "Collectors"], ["calendar", "Blackouts"], ["warehouses", "Warehouses"]].map(([k, l]) => ({ href: `/admin/operations?tab=${k}`, label: l }));

  return (
    <>
      <PageHeader title="Pickup operations" description="Service areas, free pickup slots and capacity. Pickup is always free — there is no fee setting to configure." />
      <Tabs items={tabs} active={`/admin/operations?tab=${tab}`} />

      {tab === "areas" && (
        <div className="space-y-4">
          {areas.map((a) => (
            <Card key={a.id}>
              <CardHeader title={`${a.name}`} description={`${a.city} · ${a.pincodes.length} pincodes · ${a._count.collectors} collectors`} action={<Badge tone={a.active ? "green" : "neutral"}>{a.active ? "Active" : "Paused"}</Badge>} />
              <div className="grid gap-6 p-5 lg:grid-cols-2">
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-forest">Edit area & policy</summary>
                  <AreaForm area={a} />
                </details>
                <div>
                  <div className="mb-2 text-sm font-semibold">Free pickup slots</div>
                  <div className="space-y-2">
                    {a.slots.map((s) => (
                      <ActionForm key={s.id} action={saveSlotAction} className="grid grid-cols-[1fr_70px_70px_64px_auto_auto] items-center gap-1.5">
                        <input type="hidden" name="id" value={s.id} /><input type="hidden" name="serviceAreaId" value={a.id} />
                        <Input name="label" defaultValue={s.label} className="h-9 text-sm" aria-label="Label" />
                        <Input name="startTime" defaultValue={s.startTime} className="h-9 text-sm" aria-label="Start" />
                        <Input name="endTime" defaultValue={s.endTime} className="h-9 text-sm" aria-label="End" />
                        <Input name="capacity" type="number" defaultValue={s.capacity} className="num h-9 text-sm" aria-label="Capacity" />
                        <Checkbox name="active" defaultChecked={s.active} label="On" />
                        <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                      </ActionForm>
                    ))}
                    <ActionForm action={saveSlotAction} resetOnSuccess className="grid grid-cols-[1fr_70px_70px_64px_auto] items-center gap-1.5 border-t border-dashed border-line pt-2">
                      <input type="hidden" name="serviceAreaId" value={a.id} /><input type="hidden" name="active" value="on" />
                      <Input name="label" placeholder="New slot label" className="h-9 text-sm" />
                      <Input name="startTime" placeholder="18:00" className="h-9 text-sm" />
                      <Input name="endTime" placeholder="20:00" className="h-9 text-sm" />
                      <Input name="capacity" type="number" placeholder="8" className="h-9 text-sm" />
                      <SubmitButton size="sm">Add</SubmitButton>
                    </ActionForm>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          <Card><CardHeader title="Add a service area" /><div className="p-5"><AreaForm /></div></Card>
        </div>
      )}

      {tab === "capacity" && (
        <Card>
          <CardHeader title="Next 7 days — booked vs. slot capacity" description="Plan collectors and slots before areas fill up." />
          <Table>
            <thead><tr><Th>Area</Th>{days.map((d) => <Th key={d} className="text-center">{formatDay(dayToDate(d))}</Th>)}</tr></thead>
            <tbody>
              {areas.filter((a) => a.active).map((a) => {
                const cap = a.slots.filter((s) => s.active).reduce((s, x) => s + x.capacity, 0);
                const collectorCap = collectors.filter((c) => c.serviceAreaId === a.id && c.active).reduce((s, c) => s + c.dailyCapacity, 0);
                return (
                  <tr key={a.id}>
                    <Td><div className="font-medium">{a.name}</div><div className="text-xs text-muted">slots {cap}/day · collectors {collectorCap}/day</div></Td>
                    {days.map((d) => {
                      const n = load.find((l) => l.serviceAreaId === a.id && l.pickupDate.toISOString().slice(0, 10) === d)?._count ?? 0;
                      const limit = Math.min(cap, collectorCap);
                      const pct = limit ? n / limit : 0;
                      const closed = !a.operatingDays.includes(dayToDate(d).getUTCDay());
                      return <Td key={d} className="text-center"><span className={`num inline-block min-w-14 rounded-lg px-2 py-1 text-xs font-medium ${closed ? "bg-cream-200 text-muted" : pct >= 0.9 ? "bg-danger-50 text-danger" : pct >= 0.6 ? "bg-amber-100 text-[#6b4813]" : "bg-forest-50 text-forest"}`}>{closed ? "closed" : `${n}/${limit}`}</span></Td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "collectors" && (
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Card>
            <Table>
              <thead><tr><Th>Collector</Th><Th>Zone</Th><Th>Capacity / day</Th><Th>Vehicle</Th><Th>Active</Th><Th /></tr></thead>
              <tbody>
                {collectors.map((c) => (
                  <tr key={c.id}>
                    <Td><div className="font-medium">{c.user.name}</div><div className="num text-xs text-muted">{c.employeeCode} · {c.user.phone}</div></Td>
                    <Td colSpan={5}>
                      <ActionForm action={updateCollectorAction} className="grid grid-cols-[1fr_70px_110px_auto_auto] items-center gap-1.5">
                        <input type="hidden" name="id" value={c.id} />
                        <Select name="serviceAreaId" defaultValue={c.serviceAreaId ?? ""} className="h-9 text-sm" aria-label="Zone"><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
                        <Input name="dailyCapacity" type="number" defaultValue={c.dailyCapacity} className="num h-9 text-sm" aria-label="Capacity" />
                        <Input name="vehicleNumber" defaultValue={c.vehicleNumber ?? ""} className="h-9 text-sm" aria-label="Vehicle" />
                        <Checkbox name="active" defaultChecked={c.active} label="" aria-label="Active" />
                        <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                      </ActionForm>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Add staff account" description="Collectors, warehouse managers and NGO partner logins." />
            <ActionForm action={createStaffAction} resetOnSuccess className="space-y-3 p-5">
              <Field label="Name"><Input name="name" /></Field>
              <Field label="Mobile"><Input name="phone" inputMode="tel" /></Field>
              <Field label="Role"><Select name="role"><option value="COLLECTOR">Pickup executive</option><option value="WAREHOUSE_MANAGER">Warehouse manager</option><option value="DONATION_PARTNER">Donation partner login</option><option value="ADMIN">Admin (super admin only)</option></Select></Field>
              <Field label="Zone (collectors)"><Select name="serviceAreaId"><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Vehicle"><Input name="vehicleNumber" /></Field><Field label="Capacity/day"><Input name="dailyCapacity" type="number" defaultValue={12} /></Field></div>
              <SubmitButton>Create account</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}

      {tab === "calendar" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Upcoming blackout dates" />
            <ul className="divide-y divide-line">
              {blackouts.length === 0 && <li className="px-5 py-4 text-sm text-muted">No blackouts scheduled.</li>}
              {blackouts.map((b) => <li key={b.id} className="flex items-center justify-between px-5 py-3 text-sm"><span>{formatDay(b.date)} · {areas.find((a) => a.id === b.serviceAreaId)?.name ?? "All areas"} · {b.reason}</span><ActionButton action={removeBlackoutAction} fields={{ id: b.id }} variant="ghost"><Trash2 /></ActionButton></li>)}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Add blackout" description="Holidays, festivals, weather." />
            <ActionForm action={blackoutAction} resetOnSuccess className="space-y-3 p-5">
              <Field label="Date"><Input name="date" type="date" /></Field>
              <Field label="Area"><Select name="serviceAreaId"><option value="">All areas</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
              <Field label="Reason"><Input name="reason" placeholder="Diwali" /></Field>
              <SubmitButton>Add blackout</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      )}

      {tab === "warehouses" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[...warehouses, null].map((w) => (
            <Card key={w?.id ?? "new"}>
              <CardHeader title={w ? `${w.code} · ${w.name}` : "Add warehouse"} />
              <ActionForm action={saveWarehouseAction} resetOnSuccess={!w} className="grid grid-cols-2 gap-3 p-5">
                {w && <input type="hidden" name="id" value={w.id} />}
                <Field label="Code"><Input name="code" defaultValue={w?.code} /></Field>
                <Field label="Name"><Input name="name" defaultValue={w?.name} /></Field>
                <Field label="City"><Input name="city" defaultValue={w?.city} /></Field>
                <Field label="Serves area"><Select name="serviceAreaId" defaultValue={w?.serviceAreaId ?? ""}><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
                <Field label="Address" className="col-span-2"><Input name="address" defaultValue={w?.address ?? ""} /></Field>
                <Checkbox name="active" defaultChecked={w?.active ?? true} label="Active" />
                <SubmitButton size="sm">Save</SubmitButton>
              </ActionForm>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function AreaForm({ area }: { area?: { id: string; name: string; city: string; state: string; zone: string; pincodes: string[]; active: boolean; operatingStart: string; operatingEnd: string; operatingDays: number[]; minimumKgPolicy: number; policyNote: string | null; logisticsCostPerPickupPaise: number } }) {
  return (
    <ActionForm action={saveAreaAction} resetOnSuccess={!area} className="mt-3 space-y-3">
      {area && <input type="hidden" name="id" value={area.id} />}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name"><Input name="name" defaultValue={area?.name} /></Field>
        <Field label="Zone"><Input name="zone" defaultValue={area?.zone} /></Field>
        <Field label="City"><Input name="city" defaultValue={area?.city} /></Field>
        <Field label="State"><Input name="state" defaultValue={area?.state} /></Field>
        <Field label="Opens"><Input name="operatingStart" defaultValue={area?.operatingStart ?? "09:00"} /></Field>
        <Field label="Closes"><Input name="operatingEnd" defaultValue={area?.operatingEnd ?? "19:00"} /></Field>
      </div>
      <Field label="Pincodes" hint="Comma or space separated"><Input name="pincodes" defaultValue={area?.pincodes.join(", ")} /></Field>
      <fieldset className="flex flex-wrap gap-3"><legend className="mb-1 text-sm font-medium">Operating days</legend>{DAYS.map((d, i) => <Checkbox key={d} name="operatingDays" value={String(i)} defaultChecked={area ? area.operatingDays.includes(i) : i !== 0} label={d} />)}</fieldset>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Internal logistics cost / pickup (₹)" hint="For profitability only — never charged"><Input name="logisticsCost" type="number" defaultValue={(area?.logisticsCostPerPickupPaise ?? 0) / 100} /></Field>
        <Field label="Minimum KG policy" hint="0 = no minimum (default)"><Input name="minimumKg" type="number" step="0.5" defaultValue={(area?.minimumKgPolicy ?? 0) / 1000} /></Field>
      </div>
      <Field label="Published policy note" hint="Required if you set a minimum — shown to customers before booking."><Input name="policyNote" defaultValue={area?.policyNote ?? ""} /></Field>
      <Notice tone="info">Minimums are an explicit, published policy — never a fee or deduction.</Notice>
      <div className="flex items-center gap-4"><Checkbox name="active" defaultChecked={area?.active ?? true} label="Accepting bookings" /><SubmitButton size="sm">{area ? "Save area" : "Create area"}</SubmitButton></div>
      {area && <p className="text-xs text-muted">Logistics budget: {formatINR(area.logisticsCostPerPickupPaise)} per pickup (internal).</p>}
    </ActionForm>
  );
}
