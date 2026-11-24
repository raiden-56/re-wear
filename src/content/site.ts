export const ACCEPTED = [
  "Shirts, T-shirts, tops and kurtis",
  "Jeans, trousers, skirts and shorts",
  "Sarees, salwar suits, dupattas, lehengas",
  "Dresses, jackets, sweaters and hoodies",
  "Kidswear and school uniforms",
  "Bedsheets, curtains, towels (clean, dry)",
];

export const REJECTED = [
  "Wet, damp or mouldy clothing",
  "Innerwear, socks and swimwear",
  "Shoes, bags, belts and accessories",
  "Pillows, quilts, mattresses and foam",
  "Clothing soiled with oil, paint or chemicals",
  "Medical textiles, bandages, diapers",
];

export const STEPS = [
  { title: "Tell us what you have", body: "Pick categories and an approximate weight. You'll see live per-KG rates and an instant estimate." },
  { title: "Book a free pickup", body: "Choose a date and 2-hour slot. Pickup is always free — no fees, no minimums by default." },
  { title: "Weighed in front of you", body: "Our collector weighs your bags on a calibrated digital scale, subtracts the bag weight and photographs the reading." },
  { title: "Approve & get paid to UPI", body: "Approve the valuation on your phone. Money goes straight to your UPI ID — no wallet, no withdrawal step." },
];

export const FAQ: { q: string; a: string; group: string }[] = [
  { group: "Pickup", q: "Is pickup really free?", a: "Yes. Doorstep pickup is always free. We never charge a pickup, convenience or collection fee, and we never deduct pickup costs from your earnings." },
  { group: "Pickup", q: "Is there a minimum quantity?", a: "Not by default. Pickup availability depends on whether we serve your pincode and on slot capacity. If an area ever needs a minimum, it is published on that area's booking page before you book — never applied as a fee or deduction." },
  { group: "Pickup", q: "Can I reschedule or cancel?", a: "Yes, any time before the collector starts the trip — from your bookings page, at no cost." },
  { group: "Weighing", q: "How is the weight calculated?", a: "Gross weight (clothes in bags) minus tare weight (empty bags/containers) gives the net weight. The collector enters weight per category and photographs the digital scale. You see every number before you approve." },
  { group: "Weighing", q: "What if some clothes aren't accepted?", a: "Items we can't accept (wet, soiled, innerwear, etc.) are weighed separately as rejected weight and are not paid. You can keep them or let us dispose of them responsibly." },
  { group: "Weighing", q: "What if I disagree with the valuation?", a: "Don't approve it. You can reject it and raise a dispute — our team reviews the scale photos with you. Nothing is paid or finalised without your approval." },
  { group: "Payment", q: "How do I get paid?", a: "Directly to your UPI ID (e.g. name@okaxis). There's no wallet balance to withdraw. You'll see the status — approved, processing, successful — and the bank reference (UTR) once the transfer completes." },
  { group: "Payment", q: "How long does payment take?", a: "Most payouts complete within minutes of approval. Larger payouts are reviewed by our team first, usually the same day." },
  { group: "Payment", q: "Will ReWear ask for my UPI PIN?", a: "Never. We only need your UPI ID to send money. Never share your PIN or OTPs with anyone, including collectors." },
  { group: "Pricing", q: "Why can rates change?", a: "Rates follow demand for reuse and recycling. Your booking locks the rates shown when you confirm; later price changes never alter an existing booking." },
  { group: "Impact", q: "What happens to my clothes?", a: "Everything is sorted at our hub: premium pieces are resold individually, wearable clothing goes to thrift partners and NGOs, and the rest goes to verified textile recyclers. Nothing goes to landfill if we can help it." },
];

export const IMPACT_FACTORS = {
  co2PerKg: 3.6,
  waterLitresPerKg: 675,
};
