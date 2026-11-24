"use client";

import * as React from "react";
import { PackageCheck } from "lucide-react";
import { completePickupAction } from "@/app/actions/collector";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { PhotoUploader, type Uploaded } from "@/components/forms/photo-uploader";

export function CompleteForm({ bookingId }: { bookingId: string }) {
  const [photos, setPhotos] = React.useState<Uploaded[]>([]);
  return (
    <ActionForm action={completePickupAction} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="text-sm font-medium">Hand-over photo (bags loaded, optional)</div>
      <PhotoUploader purpose="COLLECTION_EVIDENCE" value={photos} onChange={setPhotos} max={4} capture name="evidenceKeys" />
      <SubmitButton size="lg" className="w-full"><PackageCheck /> Complete pickup</SubmitButton>
    </ActionForm>
  );
}
