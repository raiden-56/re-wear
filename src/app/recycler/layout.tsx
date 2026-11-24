import { LayoutDashboard } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth/session";

export const metadata = { title: { default: "Recycler", template: "%s · ReWear Recycler" } };

export default async function RecyclerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["RECYCLER_PARTNER"], "/recycler");
  return <AppShell user={user} portal="Recycler partner" nav={[{ href: "/recycler", label: "Dispatches & settlements", icon: <LayoutDashboard />, exact: true }]}>{children}</AppShell>;
}
