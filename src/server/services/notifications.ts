import type { NotificationChannel } from "@prisma/client";
import { db } from "../db";
import { sendEmail, sendSms, sendWhatsApp } from "../providers/messaging";

type Message = { title: string; body: string; link?: string; channels?: NotificationChannel[] };

/**
 * Deliver a notification. The in-app copy is always stored; external channels are
 * attempted best-effort and their outcome is recorded (never blocks a business flow).
 */
export async function notify(userId: string, msg: Message) {
  const channels = msg.channels ?? ["IN_APP"];
  try {
    const user = await db.user.findUnique({ where: { id: userId }, include: { customerProfile: true } });
    if (!user) return;
    await db.notification.create({ data: { userId, channel: "IN_APP", title: msg.title, body: msg.body, link: msg.link, delivered: true } });
    for (const ch of channels) {
      if (ch === "IN_APP") continue;
      let delivered = false;
      let error: string | null = null;
      try {
        if (ch === "SMS" && user.phone) await sendSms(user.phone, `${msg.title}: ${msg.body}`);
        else if (ch === "WHATSAPP" && user.phone && user.customerProfile?.whatsappOptIn !== false) await sendWhatsApp(user.phone, `*${msg.title}*\n${msg.body}`);
        else if (ch === "EMAIL" && user.email) await sendEmail(user.email, msg.title, msg.body);
        else continue;
        delivered = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      await db.notification.create({ data: { userId, channel: ch, title: msg.title, body: msg.body, link: msg.link, delivered, error, readAt: new Date() } });
    }
  } catch (e) {
    console.error("notify failed", e);
  }
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
