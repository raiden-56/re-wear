import { PageHero, Prose } from "@/components/site/page-hero";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Policies" title="Privacy policy" intro="What we collect, why, and the controls you have. Written to align with India's Digital Personal Data Protection Act, 2023." />
      <Prose>
        <h2>What we collect</h2>
        <ul>
          <li>Account: mobile number, name, optional email or Google account identifier.</li>
          <li>Pickup: addresses, pickup instructions, optional photos of your clothes.</li>
          <li>Collection evidence: weights, scale photos and timestamps recorded by our collector.</li>
          <li>Payments: your UPI ID and payout references. We never collect or store UPI PINs, card numbers or bank passwords.</li>
        </ul>
        <h2>How we use it</h2>
        <p>To schedule and complete pickups, calculate and pay your earnings, prevent fraud, meet accounting obligations and — only if you opt in — send offers. Collectors see only what they need for an assigned pickup.</p>
        <h2>Sharing</h2>
        <p>With our payout and payment providers (to move money), SMS/WhatsApp/email providers (to notify you) and cloud infrastructure providers. We do not sell personal data.</p>
        <h2>Security</h2>
        <p>Role-based access controls, audit logs for every sensitive action, encrypted transport, private file storage, verified payment webhooks and rate limiting. Our app never caches your financial or personal data for offline use.</p>
        <h2>Your rights</h2>
        <p>From Profile → Privacy you can download your data or delete your account. Financial records required by law are retained in anonymised form.</p>
        <h2>Contact</h2>
        <p>Grievance officer: privacy@rewear.example.</p>
      </Prose>
    </>
  );
}
