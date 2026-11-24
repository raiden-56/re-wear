import { Boxes, ClipboardCheck, LayoutDashboard, PackageOpen, ScanLine, Store, Truck } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole } from "@/server/auth/session";

export const metadata = { title: { default: "Warehouse", template: "%s · ReWear Warehouse" } };

export default async function WarehouseLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["WAREHOUSE_MANAGER", "ADMIN", "SUPER_ADMIN"], "/warehouse");
  const nav = [
    { href: "/warehouse", label: "Overview", icon: <LayoutDashboard />, exact: true },
    { href: "/warehouse/receiving", label: "Receiving", icon: <PackageOpen /> },
    { href: "/warehouse/batches", label: "Batches & sorting", icon: <ScanLine /> },
    { href: "/warehouse/inventory", label: "Inventory", icon: <Boxes /> },
    { href: "/warehouse/adjustments", label: "Adjustments", icon: <ClipboardCheck /> },
    { href: "/warehouse/listings", label: "Resale listings", icon: <Store /> },
    { href: "/warehouse/dispatch", label: "Dispatch", icon: <Truck /> },
  ];
  return (
    <AppShell user={user} portal="Warehouse" nav={nav} mobileNav={[nav[0], nav[1], nav[2], nav[3], nav[6]]}>
      {children}
    </AppShell>
  );
}
