import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { deactivateRuleAction, decideRuleAction, proposeRuleAction } from "@/app/actions/admin";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, Card, CardHeader, Notice, PageHeader, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { channelLabel } from "@/lib/labels";
import { formatDate, formatINR, titleCase } from "@/lib/utils";

export const metadata = { title: "Pricing" };

export default async function PricingAdmin({ searchParams }: { searchParams: Promise<{ channel?: string }> }) {
  const user = await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const channel = (await searchParams).channel ?? "KG_BUYBACK";
  const now = new Date();
  const [rules, pending, categories, areas, history] = await Promise.all([
    db.pricingRule.findMany({ where: { channel: channel as never, approvalStatus: "APPROVED" }, include: { category: true, serviceArea: true }, orderBy: [{ category: { sortOrder: "asc" } }, { effectiveFrom: "desc" }] }),
    db.pricingRule.findMany({ where: { approvalStatus: "PENDING" }, include: { category: true, serviceArea: true }, orderBy: { createdAt: "asc" } }),
    db.clothingCategory.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.serviceArea.findMany({ orderBy: { name: "asc" } }),
    db.pricingHistory.findMany({ include: { pricingRule: { include: { category: true } } }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);
  const requesters = await db.user.findMany({ where: { id: { in: pending.map((p) => p.requestedById ?? "") } }, select: { id: true, name: true } });
  const live = (r: (typeof rules)[number]) => r.active && r.effectiveFrom <= now && (!r.effectiveTo || r.effectiveTo > now);
  return (
    <>
      <PageHeader title="Pricing engine" description="Category, city, area and condition-specific per-KG rates with effective dates. Every change needs a second administrator's approval; confirmed bookings keep their snapshot." />
      {pending.length > 0 && (
        <Card className="mb-6 border-amber">
          <CardHeader title={`Awaiting approval (${pending.length})`} />
          <Table>
            <thead><tr><Th>Category</Th><Th>Channel</Th><Th>Scope</Th><Th className="text-right">Rate</Th><Th>Effective</Th><Th>Requested by</Th><Th /></tr></thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.category.name}{r.notes && <div className="text-xs text-muted">{r.notes}</div>}</Td>
                  <Td className="text-sm">{channelLabel[r.channel]}</Td>
                  <Td className="text-sm">{r.serviceArea?.name ?? r.city ?? "All cities"}{r.condition !== "ANY" && ` · ${titleCase(r.condition)}`}</Td>
                  <Td className="num text-right font-semibold">{formatINR(r.pricePerKgPaise)}/kg</Td>
                  <Td className="text-sm">{formatDate(r.effectiveFrom)}{r.effectiveTo && ` → ${formatDate(r.effectiveTo)}`}</Td>
                  <Td className="text-sm">{requesters.find((x) => x.id === r.requestedById)?.name ?? "—"}{r.requestedById === user.id && <div className="text-xs text-muted">(you)</div>}</Td>
                  <Td><div className="flex gap-1"><ActionButton action={decideRuleAction} fields={{ ruleId: r.id, decision: "APPROVE" }} variant="primary">Approve</ActionButton><ActionButton action={decideRuleAction} fields={{ ruleId: r.id, decision: "REJECT" }} variant="ghost">Reject</ActionButton></div></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div>
          <Tabs items={[{ href: "/admin/pricing", label: "KG buyback" }, { href: "/admin/pricing?channel=PREMIUM_RESALE", label: "Premium resale" }, { href: "/admin/pricing?channel=RECYCLING", label: "Recycling" }]} active={channel === "KG_BUYBACK" ? "/admin/pricing" : `/admin/pricing?channel=${channel}`} />
          <Card>
            <Table>
              <thead><tr><Th>Category</Th><Th>Scope</Th><Th className="text-right">Rate / kg</Th><Th>Effective</Th><Th>State</Th><Th /></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className={live(r) ? "" : "text-muted"}>
                    <Td className="font-medium">{r.category.name}</Td>
                    <Td className="text-sm">{r.serviceArea?.name ?? r.city ?? "All cities"}{r.condition !== "ANY" && ` · ${titleCase(r.condition)}`}</Td>
                    <Td className="num text-right font-semibold">{formatINR(r.pricePerKgPaise)}</Td>
                    <Td className="text-xs">{formatDate(r.effectiveFrom)}{r.effectiveTo ? ` → ${formatDate(r.effectiveTo)}` : " → open"}</Td>
                    <Td>{live(r) ? <Badge tone="green">Live</Badge> : r.effectiveFrom > now ? <Badge tone="blue">Scheduled</Badge> : <Badge>Expired</Badge>}</Td>
                    <Td>{live(r) && <ActionButton action={deactivateRuleAction} fields={{ ruleId: r.id }} variant="ghost" confirm="Deactivate this rate? Categories without a live rate can't be booked.">Deactivate</ActionButton>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Propose a rate change" />
            <ActionForm action={proposeRuleAction} resetOnSuccess className="space-y-3 p-5">
              <Field label="Category"><Select name="categoryId">{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Channel"><Select name="channel" defaultValue={channel}><option value="KG_BUYBACK">KG buyback</option><option value="PREMIUM_RESALE">Premium resale</option><option value="RECYCLING">Recycling</option></Select></Field>
                <Field label="Condition"><Select name="condition"><option value="ANY">Any</option><option value="EXCELLENT">Excellent</option><option value="GOOD">Good</option><option value="FAIR">Fair</option><option value="WORN">Worn</option></Select></Field>
                <Field label="Service area"><Select name="serviceAreaId"><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
                <Field label="or City"><Input name="city" placeholder="All cities" /></Field>
                <Field label="Rate ₹/kg"><Input name="price" type="number" step="0.5" min="0" /></Field>
                <Field label="Effective from"><Input name="effectiveFrom" type="datetime-local" /></Field>
                <Field label="Expires (optional)" className="col-span-2"><Input name="effectiveTo" type="datetime-local" /></Field>
              </div>
              <Field label="Reason"><Input name="notes" /></Field>
              <SubmitButton>Submit for approval</SubmitButton>
              <Notice tone="info">Approving a rule automatically closes the overlapping live rule with the same scope. Existing bookings are never repriced.</Notice>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Pricing history" />
            <ul className="divide-y divide-line text-sm">
              {history.map((h) => <li key={h.id} className="px-5 py-2.5"><div className="flex justify-between"><span className="font-medium">{h.pricingRule.category.name}</span><span className="text-xs text-muted">{formatDate(h.createdAt, true)}</span></div><div className="num text-xs text-muted">{titleCase(h.action)}{h.oldPricePaise !== null && ` ${formatINR(h.oldPricePaise)}`}{h.newPricePaise !== null && ` → ${formatINR(h.newPricePaise)}`}{h.note && ` · ${h.note}`}</div></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
