import { replyTicketAction } from "@/app/actions/customer";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Textarea } from "@/components/ui/form";
import { cn, formatDate } from "@/lib/utils";

type Msg = { id: string; body: string; internal: boolean; createdAt: Date; authorId: string; author: { name: string | null } };

export function TicketThread({ ticketId, messages, viewerId, showInternal, closed }: { ticketId: string; messages: Msg[]; viewerId: string; showInternal?: boolean; closed?: boolean }) {
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {messages.filter((m) => showInternal || !m.internal).map((m) => (
          <li key={m.id} className={cn("max-w-[85%] rounded-2xl p-4 text-sm", m.authorId === viewerId ? "ml-auto bg-forest text-white" : m.internal ? "bg-amber-100" : "bg-cream")}>
            <div className="mb-1 text-xs opacity-70">{m.author.name ?? "ReWear"} · {formatDate(m.createdAt, true)}{m.internal && " · internal note"}</div>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </li>
        ))}
      </ul>
      {!closed && (
        <ActionForm action={replyTicketAction} resetOnSuccess className="space-y-2">
          <input type="hidden" name="ticketId" value={ticketId} />
          <Textarea name="body" rows={3} placeholder="Write a reply…" aria-label="Reply" />
          <SubmitButton size="sm">Send reply</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
