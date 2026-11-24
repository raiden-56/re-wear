"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { AddressForm } from "./address-form";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type Initial = { id: string; label: string; contactName: string; contactPhone: string; line1: string; line2: string; landmark: string; city: string; state: string; pincode: string; isDefault: boolean };

export function AddressEditor({ address, inline }: { address?: Initial; inline?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [k, setK] = React.useState(0);
  if (inline) return <AddressForm key={k} onSaved={() => { setK((x) => x + 1); router.refresh(); }} />;
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Edit address" trigger={<Button variant="ghost" size="sm" aria-label="Edit address"><Pencil /></Button>}>
      <AddressForm initial={address} onSaved={() => { setOpen(false); router.refresh(); }} />
    </Dialog>
  );
}
