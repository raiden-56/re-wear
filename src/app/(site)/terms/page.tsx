import { PageHero, Prose } from "@/components/site/page-hero";

export const metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Policies" title="Terms of service" intro="The rules that govern selling, buying and partnering with ReWear. Last updated November 2026." />
      <Prose>
        <h2 id="free-pickup">1. Free pickup policy</h2>
        <p>Doorstep pickup is free. ReWear does not charge pickup, convenience, collection or logistics fees, and never deducts such costs from your earnings. Pickup availability depends on whether your pincode is in a serviceable area and on slot capacity. If ReWear introduces a minimum quantity for an area, it will be published on the booking screen for that area before you book; it will never be applied as a fee or deduction.</p>
        <h2>2. Pricing and estimates</h2>
        <p>Rates are published per kilogram per category and may differ by city, channel and condition. Your booking stores a snapshot of the rates in force at confirmation. Estimates are indicative; the final amount depends on the verified net weight, inspection and the snapshot rates.</p>
        <h2>3. Weighing and valuation</h2>
        <ul>
          <li>Net weight = gross weight − tare weight (bags/containers).</li>
          <li>Items that do not meet our guidelines are weighed separately as rejected weight and are not paid.</li>
          <li>Deductions apply only where our published policy permits them and are shown line by line.</li>
          <li>A valuation is final only after you approve it. Each approval records the valuation version and timestamp.</li>
          <li>If warehouse re-inspection results in a revised valuation, you must approve it before it applies. If you reject a valuation, it is routed to dispute review or the clothes are returned, as stated in our published policy.</li>
        </ul>
        <h2>4. Payments</h2>
        <p>Payments are made directly to the UPI ID you provide. ReWear does not operate a withdrawable wallet. A payment is shown as successful only when our payout provider confirms it. ReWear never asks for your UPI PIN or OTPs. If a transfer fails or is reversed, we retry or contact you; a retry never results in a duplicate payment.</p>
        <h2>5. Marketplace purchases</h2>
        <p>Pre-loved items are inspected and described honestly, including any visible wear. Items are reserved for a short time during checkout. Cancellations before dispatch are refunded in full to the original payment method.</p>
        <h2>6. Business, recycler and NGO partners</h2>
        <p>Business accounts are subject to verification. Bulk orders are confirmed against available stock and invoiced. Donations are recorded separately from commercial sales and acknowledged by the receiving NGO.</p>
        <h2>7. Rewards</h2>
        <p>ReWear points are loyalty points. They have no cash value and cannot be withdrawn.</p>
      </Prose>
    </>
  );
}
