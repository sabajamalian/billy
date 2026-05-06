import { EventEmitter } from "node:events";

export type BillEvent =
  | { type: "bill.updated"; billId: string; version: number; at: number }
  | { type: "bill.deleted"; billId: string; at: number };

export interface BillChannelSubscription {
  unsubscribe(): void;
}

type BillChannelState = { emitters: Map<string, EventEmitter> };

const BILL_EVENT_NAME = "bill-event";

const globalForChannel = globalThis as typeof globalThis & {
  __billChannel?: BillChannelState;
};

if (!globalForChannel.__billChannel) {
  globalForChannel.__billChannel = { emitters: new Map() };
}

const state = globalForChannel.__billChannel;

const getOrCreateEmitter = (billId: string): EventEmitter => {
  const existing = state.emitters.get(billId);
  if (existing) return existing;

  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  state.emitters.set(billId, emitter);
  return emitter;
};

/**
 * In-process bill update channel for the single-container deployment.
 * Mutating bill API routes should publish after the database transaction commits,
 * e.g. `billChannel.publish(updated.id, { type: "bill.updated", billId: updated.id, version: updated.version, at: Date.now() })`.
 */
export const billChannel = {
  publish(billId: string, event: BillEvent): void {
    const emitter = state.emitters.get(billId);
    if (!emitter) return;

    for (const listener of emitter.listeners(BILL_EVENT_NAME)) {
      try {
        (listener as (event: BillEvent) => void)(event);
      } catch {
        // A broken subscriber must not prevent other guests from receiving updates.
      }
    }
  },

  subscribe(billId: string, handler: (event: BillEvent) => void): BillChannelSubscription {
    const emitter = getOrCreateEmitter(billId);
    let subscribed = true;

    emitter.on(BILL_EVENT_NAME, handler);

    return {
      unsubscribe(): void {
        if (!subscribed) return;
        subscribed = false;

        emitter.off(BILL_EVENT_NAME, handler);
        if (emitter.listenerCount(BILL_EVENT_NAME) === 0) {
          state.emitters.delete(billId);
        }
      },
    };
  },

  _reset(): void {
    for (const emitter of state.emitters.values()) {
      emitter.removeAllListeners();
    }
    state.emitters.clear();
  },

  _activeSubscriberCount(billId: string): number {
    return state.emitters.get(billId)?.listenerCount(BILL_EVENT_NAME) ?? 0;
  },
};
