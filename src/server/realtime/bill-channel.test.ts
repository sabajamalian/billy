import { afterEach, describe, expect, it, vi } from "vitest";
import { billChannel, type BillEvent } from "./bill-channel";

afterEach(() => {
  billChannel._reset();
});

const updatedEvent = (billId = "bill-a", version = 1): BillEvent => ({
  type: "bill.updated",
  billId,
  version,
  at: 123,
});

describe("billChannel", () => {
  it("delivers published events to a subscriber", () => {
    const handler = vi.fn();
    const event = updatedEvent();

    billChannel.subscribe("bill-a", handler);
    billChannel.publish("bill-a", event);

    expect(handler).toHaveBeenCalledExactlyOnceWith(event);
  });

  it("delivers each event to multiple subscribers", () => {
    const first = vi.fn();
    const second = vi.fn();
    const event = updatedEvent();

    billChannel.subscribe("bill-a", first);
    billChannel.subscribe("bill-a", second);
    billChannel.publish("bill-a", event);

    expect(first).toHaveBeenCalledExactlyOnceWith(event);
    expect(second).toHaveBeenCalledExactlyOnceWith(event);
  });

  it("stops delivering events after unsubscribe", () => {
    const handler = vi.fn();
    const sub = billChannel.subscribe("bill-a", handler);

    billChannel.publish("bill-a", updatedEvent("bill-a", 1));
    sub.unsubscribe();
    billChannel.publish("bill-a", updatedEvent("bill-a", 2));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(updatedEvent("bill-a", 1));
  });

  it("removes the emitter after the last unsubscribe", () => {
    const first = billChannel.subscribe("bill-a", vi.fn());
    const second = billChannel.subscribe("bill-a", vi.fn());

    expect(billChannel._activeSubscriberCount("bill-a")).toBe(2);
    first.unsubscribe();
    expect(billChannel._activeSubscriberCount("bill-a")).toBe(1);
    second.unsubscribe();
    expect(billChannel._activeSubscriberCount("bill-a")).toBe(0);
  });

  it("does not throw when publishing without subscribers", () => {
    expect(() => billChannel.publish("bill-a", updatedEvent())).not.toThrow();
  });

  it("isolates subscribers by bill id", () => {
    const billAHandler = vi.fn();
    const billBHandler = vi.fn();
    const event = updatedEvent("bill-a");

    billChannel.subscribe("bill-a", billAHandler);
    billChannel.subscribe("bill-b", billBHandler);
    billChannel.publish("bill-a", event);

    expect(billAHandler).toHaveBeenCalledExactlyOnceWith(event);
    expect(billBHandler).not.toHaveBeenCalled();
  });

  it("continues delivering when one subscriber throws", () => {
    const broken = vi.fn(() => {
      throw new Error("subscriber failed");
    });
    const healthy = vi.fn();
    const event = updatedEvent();

    billChannel.subscribe("bill-a", broken);
    billChannel.subscribe("bill-a", healthy);
    expect(() => billChannel.publish("bill-a", event)).not.toThrow();

    expect(broken).toHaveBeenCalledExactlyOnceWith(event);
    expect(healthy).toHaveBeenCalledExactlyOnceWith(event);
  });
});
