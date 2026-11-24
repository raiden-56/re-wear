import { HandHeart } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth/session";

export const metadata = { title: { default: "NGO partner", template: "%s · ReWear NGO" } };

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["DONATION_PARTNER"], "/partner");
  return <AppShell user={user} portal="NGO partner" nav={[{ href: "/partner", label: "Donations", icon: <HandHeart />, exact: true }]}>{children}</AppShell>;
}
