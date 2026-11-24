"use client";

import * as React from "react";
import { createUnitAction } from "@/app/actions/warehouse";
import { ActionForm, FieldError, SubmitButton } from "@/components/forms/action-form";
import { PhotoUploader, type Uploaded } from "@/components/forms/photo-uploader";
import { Field, Input, Select } from "@/components/ui/form";

export function UnitForm({ lotId }: { lotId: string }) {
  const [photos, setPhotos] = React.useState<Uploaded[]>([]);
  return (
    <ActionForm action={createUnitAction} className="space-y-3">
      <input type="hidden" name="lotId" value={lotId} />
      <Field label="Garment title"><Input name="title" placeholder="e.g. Navy wool blazer" /><FieldError name="title" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Brand"><Input name="brand" /></Field>
        <Field label="Size"><Input name="size" placeholder="M / 32 / Free" /></Field>
        <Field label="Condition"><Select name="condition"><option value="EXCELLENT">Excellent</option><option value="GOOD">Good</option><option value="FAIR">Fair</option></Select></Field>
        <Field label="Weight (g)"><Input name="grams" type="number" min="1" /></Field>
      </div>
      <PhotoUploader purpose="INVENTORY_PHOTO" value={photos} onChange={setPhotos} max={6} name="photoKeys" />
      <SubmitButton>Create garment</SubmitButton>
    </ActionForm>
  );
}
