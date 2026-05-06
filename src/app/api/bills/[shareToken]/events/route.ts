import { BillExpiredError, getActiveBill } from "@/server/billing/bill-service";
import { billChannel } from "@/server/realtime/bill-channel";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await ctx.params;

  const bill = await getActiveBill(shareToken).catch((error: unknown) => {
    if (error instanceof BillExpiredError) return error;
    return null;
  });

  if (bill instanceof BillExpiredError) {
    return new Response("Gone", { status: 410 });
  }

  if (!bill) {
    return new Response("Not found", { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;

      const send = (data: unknown, eventName?: string) => {
        let payload = "";
        if (eventName) payload += `event: ${eventName}\n`;
        payload += `data: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(enc.encode(payload));
        } catch {
          closed = true;
        }
      };

      send({ type: "hello", billId: bill.id, version: bill.version, at: Date.now() }, "hello");

      const sub = billChannel.subscribe(bill.id, (ev) => {
        send(ev, ev.type);
      });

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 25_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        sub.unsubscribe();
        try {
          controller.close();
        } catch {
          // Connection may already be closed by the client.
        }
      };

      req.signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
