"use client";

import * as React from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void };
  }
}

/** Razorpay Standard Checkout; the signature is verified server-side in /api/payments/verify. */
export function RazorpayCheckout({ orderId, orderRef, amountPaise, keyId, name }: { orderId: string; orderRef: string; amountPaise: number; keyId: string; name: string }) {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const open = () => {
    if (!window.Razorpay) return;
    new window.Razorpay({
      key: keyId,
      amount: amountPaise,
      currency: "INR",
      order_id: orderRef,
      name: "ReWear",
      description: "Pre-loved order",
      prefill: { name },
      theme: { color: "#174B37" },
      handler: async (r: RazorpayResponse) => {
        const res = await fetch("/api/payments/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }) });
        if (res.ok) router.push(`/app/orders/${orderId}?paid=1`);
        else toast.error((await res.json()).error ?? "Payment verification failed");
      },
    }).open();
  };
  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setReady(true)} />
      <Button size="lg" className="mt-6 w-full" disabled={!ready} onClick={open}>Pay securely</Button>
    </>
  );
}
