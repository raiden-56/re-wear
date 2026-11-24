import { Check, Minus } from "lucide-react";
import { requireRole } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { getAllSettings, type SettingKey } from "@/server/settings";
import { PERMISSIONS, ROLE_PERMISSIONS, type RoleKey } from "@/server/auth/permissions";
import { categoryAction, settingAction, templateAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Input, Textarea } from "@/components/ui/form";
import { Badge, Card, CardHeader, Notice, PageHeader, Table, Tabs, Td, Th } from "@/components/ui/primitives";
import { roleLabel } from "@/lib/labels";

export const metadata = { title: "Settings" };

const GROUPS: { key: SettingKey; title: string; help: string }[] = [
  { key: "branding", title: "Branding & contact", help: "Name, tagline and support contacts shown across the site." },
  { key: "pickup", title: "Pickup availability", help: "Booking window and same-day cut-off. Pickup fees cannot be configured — pickup is always free." },
  { key: "valuation", title: "Valuation policy", help: "Deductions (off by default), weight tolerance, rejection flow (DISPUTE or RETURN) and re-inspection threshold." },
  { key: "payouts", title: "Payout controls", help: "Auto-approval limit (paise) and maximum provider attempts." },
  { key: "rewards", title: "Rewards & referrals", help: "Points only — no cash value." },
  { key: "marketplace", title: "Marketplace", help: "Reservation window and shipping." },
  { key: "testimonials", title: "Verified testimonials", help: "Only real customers with written consent and a completed booking code." },
  { key: "integrations", title: "Feature flags", help: "Optional AI clothing classification and other toggles." },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireRole(["ADMIN", "SUPER_ADMIN"]);
  const tab = (await searchParams).tab ?? "policies";
  const [settings, categories, templates] = await Promise.all([getAllSettings(), db.clothingCategory.findMany({ orderBy: { sortOrder: "asc" } }), db.notificationTemplate.findMany({ orderBy: [{ key: "asc" }, { channel: "asc" }] })]);
  const e = env();
  const integrations = [
    ["SMS / OTP", e.OTP_PROVIDER, e.OTP_PROVIDER !== "console"],
    ["WhatsApp Business", e.WHATSAPP_PROVIDER, e.WHATSAPP_PROVIDER !== "console"],
    ["Email", e.EMAIL_PROVIDER, e.EMAIL_PROVIDER !== "console"],
    ["UPI payouts", e.PAYOUT_PROVIDER, e.PAYOUT_PROVIDER !== "sandbox"],
    ["Customer payments", e.PAYMENT_PROVIDER, e.PAYMENT_PROVIDER !== "sandbox"],
    ["Google sign-in", e.GOOGLE_CLIENT_ID ? "configured" : "not configured", !!e.GOOGLE_CLIENT_ID],
    ["File storage", e.STORAGE_DRIVER, e.STORAGE_DRIVER !== "local"],
    ["Maps", e.NEXT_PUBLIC_MAPS_PROVIDER ?? "Google Maps deep links", !!e.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY],
  ] as const;
  const roles = Object.keys(ROLE_PERMISSIONS) as RoleKey[];
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs items={[["policies", "Policies"], ["categories", "Categories"], ["templates", "Notification templates"], ["permissions", "Permissions"], ["integrations", "Integrations"]].map(([k, l]) => ({ href: `/admin/settings?tab=${k}`, label: l }))} active={`/admin/settings?tab=${tab}`} />
      {tab === "policies" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {GROUPS.map((g) => (
            <Card key={g.key}>
              <CardHeader title={g.title} description={g.help} />
              <ActionForm action={settingAction} className="space-y-2 p-5">
                <input type="hidden" name="key" value={g.key} />
                <Textarea name="json" rows={8} defaultValue={JSON.stringify(settings[g.key], null, 2)} className="font-mono text-xs" spellCheck={false} aria-label={`${g.title} JSON`} />
                <SubmitButton size="sm">Save</SubmitButton>
              </ActionForm>
            </Card>
          ))}
        </div>
      )}
      {tab === "categories" && (
        <Card>
          <Table>
            <thead><tr><Th>Order</Th><Th>Slug</Th><Th>Name</Th><Th>Group</Th><Th>Description</Th><Th>Flags</Th><Th /></tr></thead>
            <tbody>
              {[...categories, null].map((c) => (
                <tr key={c?.id ?? "new"}>
                  <Td colSpan={7}>
                    <ActionForm action={categoryAction} resetOnSuccess={!c} className="grid grid-cols-[56px_140px_1fr_100px_1.5fr_auto_auto] items-center gap-2">
                      {c && <input type="hidden" name="id" value={c.id} />}
                      <Input name="sortOrder" type="number" defaultValue={c?.sortOrder ?? categories.length} className="h-9 text-sm" aria-label="Order" />
                      <Input name="slug" defaultValue={c?.slug} placeholder="slug" className="h-9 text-sm" aria-label="Slug" />
                      <Input name="name" defaultValue={c?.name} placeholder="New category" className="h-9 text-sm" aria-label="Name" />
                      <Input name="group" defaultValue={c?.group ?? "APPAREL"} className="h-9 text-sm" aria-label="Group" />
                      <Input name="description" defaultValue={c?.description ?? ""} className="h-9 text-sm" aria-label="Description" />
                      <div className="flex gap-3"><Checkbox name="accepted" defaultChecked={c?.accepted ?? true} label="Accepted" /><Checkbox name="active" defaultChecked={c?.active ?? true} label="Active" /></div>
                      <SubmitButton size="sm" variant={c ? "secondary" : "primary"}>{c ? "Save" : "Add"}</SubmitButton>
                    </ActionForm>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {tab === "templates" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader title={t.key} action={<Badge tone="blue">{t.channel}</Badge>} />
              <ActionForm action={templateAction} className="space-y-2 p-5">
                <input type="hidden" name="id" value={t.id} />
                {t.channel === "EMAIL" && <Input name="subject" defaultValue={t.subject ?? ""} placeholder="Subject" />}
                <Textarea name="body" rows={3} defaultValue={t.body} />
                <div className="flex items-center justify-between"><Checkbox name="active" defaultChecked={t.active} label="Active" /><SubmitButton size="sm">Save</SubmitButton></div>
              </ActionForm>
            </Card>
          ))}
        </div>
      )}
      {tab === "permissions" && (
        <Card>
          <CardHeader title="Role permission matrix" description="Enforced server-side in every service and action. Changes are made in code and reviewed." />
          <Table>
            <thead><tr><Th>Permission</Th>{roles.map((r) => <Th key={r} className="text-center">{roleLabel[r]}</Th>)}</tr></thead>
            <tbody>{(Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[]).map((p) => <tr key={p}><Td><div className="num text-xs font-medium">{p}</div><div className="text-xs text-muted">{PERMISSIONS[p]}</div></Td>{roles.map((r) => <Td key={r} className="text-center">{ROLE_PERMISSIONS[r].includes(p) ? <Check className="mx-auto size-4 text-forest" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-line" aria-label="Not allowed" />}</Td>)}</tr>)}</tbody>
          </Table>
        </Card>
      )}
      {tab === "integrations" && (
        <Card>
          <CardHeader title="Integration status" description="Configured through environment variables (never stored in the database)." />
          <Table>
            <thead><tr><Th>Integration</Th><Th>Provider</Th><Th>Mode</Th></tr></thead>
            <tbody>{integrations.map(([n, p, live]) => <tr key={n}><Td className="font-medium">{n}</Td><Td className="text-sm">{p}</Td><Td>{live ? <Badge tone="green">Live</Badge> : <Badge tone="amber">Development</Badge>}</Td></tr>)}</tbody>
          </Table>
          <div className="p-5"><Notice tone="info">Webhook endpoints: <code className="num">/api/webhooks/payouts</code> (RazorpayX payout events, HMAC-SHA256 verified) and <code className="num">/api/webhooks/payments</code>. Reconciliation cron: <code className="num">/api/cron/reconcile</code>.</Notice></div>
        </Card>
      )}
    </>
  );
}
