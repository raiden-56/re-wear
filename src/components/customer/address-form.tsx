"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { saveAddressAction } from "@/app/actions/customer";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";

const STATES = ["Karnataka", "Maharashtra", "Telangana", "Tamil Nadu", "Delhi", "Haryana", "Uttar Pradesh", "Gujarat", "Kerala", "West Bengal", "Rajasthan", "Andhra Pradesh"];

const schema = z.object({
  label: z.string().min(1).max(30),
  contactName: z.string().trim().min(2, "Contact name is required"),
  contactPhone: z.string().trim().regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().trim().min(3, "House / flat and building is required"),
  line2: z.string().optional(),
  landmark: z.string().optional(),
  city: z.string().trim().min(2, "City is required"),
  state: z.string().min(2, "State is required"),
  pincode: z.string().regex(/^\d{6}$/, "Enter a 6-digit pincode"),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  isDefault: z.boolean(),
});
type Values = z.infer<typeof schema>;

export type SavedAddress = { id: string; serviceable: boolean; label: string; line1: string; city: string; pincode: string };

export function AddressForm({ initial, onSaved, submitLabel = "Save address" }: { initial?: Partial<Values> & { id?: string }; onSaved?: (a: SavedAddress) => void; submitLabel?: string }) {
  const [pending, start] = React.useTransition();
  const [locating, setLocating] = React.useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { label: "Home", contactName: "", contactPhone: "", line1: "", line2: "", landmark: "", city: "", state: "Karnataka", pincode: "", isDefault: false, ...initial },
  });
  const e = form.formState.errors;

  const submit = form.handleSubmit((v) => {
    const fd = new FormData();
    if (initial?.id) fd.set("id", initial.id);
    for (const [k, val] of Object.entries(v)) if (val !== undefined && val !== null && !(k === "isDefault" && !val)) fd.set(k, String(val === true ? "on" : val));
    start(async () => {
      const r = await saveAddressAction({ ok: false }, fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      onSaved?.(r.data as SavedAddress);
    });
  });

  const locate = () => {
    if (!navigator.geolocation) return toast.error("Location isn't available on this device.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.setValue("latitude", pos.coords.latitude.toFixed(6));
        form.setValue("longitude", pos.coords.longitude.toFixed(6));
        setLocating(false);
        toast.success("Location pinned — helps your collector find you.");
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Label" error={e.label?.message}>
          <Select {...form.register("label")}><option>Home</option><option>Work</option><option>Parents' home</option><option>Other</option></Select>
        </Field>
        <Field label="Contact name" error={e.contactName?.message} className="sm:col-span-2"><Input autoComplete="name" {...form.register("contactName")} /></Field>
      </div>
      <Field label="Contact phone" error={e.contactPhone?.message}><Input inputMode="tel" autoComplete="tel" {...form.register("contactPhone")} /></Field>
      <Field label="Flat / house no., building" error={e.line1?.message}><Input autoComplete="address-line1" {...form.register("line1")} /></Field>
      <Field label="Street, area"><Input autoComplete="address-line2" {...form.register("line2")} /></Field>
      <Field label="Landmark (optional)"><Input {...form.register("landmark")} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Pincode" error={e.pincode?.message}><Input inputMode="numeric" maxLength={6} autoComplete="postal-code" {...form.register("pincode")} /></Field>
        <Field label="City" error={e.city?.message}><Input autoComplete="address-level2" {...form.register("city")} /></Field>
        <Field label="State" error={e.state?.message}><Select {...form.register("state")}>{STATES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={locate} disabled={locating}>
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} {form.watch("latitude") ? "Location pinned" : "Pin my location"}
        </Button>
        <Checkbox label="Set as default" checked={form.watch("isDefault")} onChange={(ev) => form.setValue("isDefault", ev.target.checked)} />
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending && <Loader2 className="animate-spin" />} {submitLabel}</Button>
    </form>
  );
}
