import { Building2, LayoutDashboard, PackageSearch, Receipt } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth/session";

export const metadata = { title: { default: "Business", template: "%s · ReWear Business" } };

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["B2B_BUYER"], "/business");
  return (
    <AppShell user={user} portal="Business portal" nav={[
      { href: "/business", label: "Dashboard", icon: <LayoutDashboard />, exact: true },
      { href: "/business/catalogue", label: "Bulk catalogue", icon: <PackageSearch /> },
      { href: "/business/orders", label: "Orders & invoices", icon: <Receipt /> },
      { href: "/business/profile", label: "Business profile", icon: <Building2 /> },
    ]}>
      {children}
    </AppShell>
  );
}
