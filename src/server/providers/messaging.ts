import { env } from "../env";

/**
 * Outbound messaging adapters. In development the "console" providers log messages
 * instead of sending them, so no real SMS/WhatsApp/email is ever sent by accident.
 */
type Meta = { otp?: string };

function devLog(channel: string, to: string, body: string) {
  if (env().NODE_ENV !== "test") console.info(`[${channel} → ${to}] ${body}`);
}

export async function sendSms(to: string, body: string, meta: Meta = {}) {
  const e = env();
  if (e.OTP_PROVIDER === "msg91") {
    if (!e.MSG91_AUTH_KEY || !e.MSG91_TEMPLATE_ID) throw new Error("MSG91 is not configured");
    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: e.MSG91_AUTH_KEY, "content-type": "application/json" },
      body: JSON.stringify({ template_id: e.MSG91_TEMPLATE_ID, recipients: [{ mobiles: to.replace("+", ""), otp: meta.otp, message: body }] }),
    });
    if (!res.ok) throw new Error(`MSG91 send failed: ${res.status}`);
    return;
  }
  if (e.OTP_PROVIDER === "twilio") {
    if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN || !e.TWILIO_FROM) throw new Error("Twilio is not configured");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${e.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: "Basic " + Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString("base64"),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: e.TWILIO_FROM, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio send failed: ${res.status}`);
    return;
  }
  devLog("SMS", to, body);
}

export async function sendWhatsApp(to: string, body: string) {
  const e = env();
  if (e.WHATSAPP_PROVIDER === "meta") {
    if (!e.WHATSAPP_TOKEN || !e.WHATSAPP_PHONE_NUMBER_ID) throw new Error("WhatsApp Business is not configured");
    const res = await fetch(`https://graph.facebook.com/v21.0/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${e.WHATSAPP_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace("+", ""), type: "text", text: { body } }),
    });
    if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status}`);
    return;
  }
  devLog("WhatsApp", to, body);
}

export async function sendEmail(to: string, subject: string, text: string) {
  const e = env();
  if (e.EMAIL_PROVIDER === "resend") {
    if (!e.RESEND_API_KEY) throw new Error("Resend is not configured");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to, subject, text }),
    });
    if (!res.ok) throw new Error(`Email send failed: ${res.status}`);
    return;
  }
  devLog("Email", to, `${subject} — ${text}`);
}
