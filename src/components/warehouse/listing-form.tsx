"use client";

import * as React from "react";
import { createProductAction } from "@/app/actions/warehouse";
import { ActionForm, FieldError, SubmitButton } from "@/components/forms/action-form";
import { PhotoUploader, type Uploaded } from "@/components/forms/photo-uploader";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

export function ListingForm({ item, categories }: { item: { id: string; title: string | null; brand: string | null; size: string | null; condition: string; categoryId: string }; categories: { id: string; name: string }[] }) {
  const [photos, setPhotos] = React.useState<Uploaded[]>([]);
  return (
    <ActionForm action={createProductAction} className="space-y-4">
      <input type="hidden" name="inventoryItemId" value={item.id} />
      <Field label="Product name"><Input name="name" defaultValue={item.title ?? ""} /><FieldError name="name" /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Brand"><Input name="brand" defaultValue={item.brand ?? ""} /></Field>
        <Field label="Size"><Input name="size" defaultValue={item.size ?? ""} /></Field>
        <Field label="For"><Select name="gender"><option>Women</option><option>Men</option><option>Kids</option><option>Unisex</option></Select></Field>
        <Field label="Category"><Select name="categoryId" defaultValue={item.categoryId}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Condition"><Select name="condition" defaultValue={["EXCELLENT", "GOOD", "FAIR"].includes(item.condition) ? item.condition : "GOOD"}><option value="EXCELLENT">Excellent</option><option value="GOOD">Good</option><option value="FAIR">Fair</option></Select></Field>
      </div>
      <Field label="Description" hint="Be honest about wear, fading or alterations."><Textarea name="description" rows={4} /><FieldError name="description" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Selling price (₹)"><Input name="price" type="number" min="1" step="1" /><FieldError name="price" /></Field>
        <Field label="Original MRP (₹, optional)"><Input name="mrp" type="number" min="1" step="1" /></Field>
      </div>
      <Field label="Photographs"><PhotoUploader purpose="INVENTORY_PHOTO" value={photos} onChange={setPhotos} max={8} name="photoKeys" /></Field>
      <Field label="Or image URLs (https, one per line)"><Textarea name="photoUrls" rows={2} placeholder="https://images.unsplash.com/…" /></Field>
      <SubmitButton size="lg">Create draft listing</SubmitButton>
    </ActionForm>
  );
}
