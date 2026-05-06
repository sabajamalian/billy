import { beforeEach, describe, expect, it } from "vitest";

import { useSelectionsStore } from "./selections";

const store = useSelectionsStore;

beforeEach(() => {
  localStorage.clear();
  store.setState({ byBill: {} });
});

describe("useSelectionsStore", () => {
  it("setShares with positive shares stores the value", () => {
    store.getState().setShares("bill-a", "item-a", 1.5);

    expect(store.getState().byBill["bill-a"]?.selections).toEqual({ "item-a": 1.5 });
  });

  it("setShares(0) removes the entry", () => {
    store.getState().setShares("bill-a", "item-a", 1);
    store.getState().setShares("bill-a", "item-a", 0);

    expect(store.getState().byBill["bill-a"]?.selections).toEqual({});
  });

  it("setShares(-1) removes the entry", () => {
    store.getState().setShares("bill-a", "item-a", 1);
    store.getState().setShares("bill-a", "item-a", -1);

    expect(store.getState().byBill["bill-a"]?.selections).toEqual({});
  });

  it("incShares increments with default delta and explicit fractional delta", () => {
    store.getState().incShares("bill-a", "item-a");
    store.getState().incShares("bill-a", "item-a", 0.5);

    expect(store.getState().byBill["bill-a"]?.selections["item-a"]).toBe(1.5);
  });

  it("decShares clamps at 0 and never goes negative", () => {
    store.getState().setShares("bill-a", "item-a", 0.5);
    store.getState().decShares("bill-a", "item-a");

    expect(store.getState().byBill["bill-a"]?.selections).toEqual({});
  });

  it("setNickname persists per bill", () => {
    store.getState().setNickname("bill-a", " Saba ");

    expect(store.getState().byBill["bill-a"]?.nickname).toBe("Saba");
    expect(localStorage.getItem("billy:selections:v1")).toContain("Saba");
  });

  it("pruneStaleForBill drops keys not in the valid list", () => {
    store.getState().setShares("bill-a", "item-a", 1);
    store.getState().setShares("bill-a", "stale", 1);
    store.getState().pruneStaleForBill("bill-a", ["item-a"]);

    expect(store.getState().byBill["bill-a"]?.selections).toEqual({ "item-a": 1 });
  });

  it("resetBill clears selections and nickname for that bill", () => {
    store.getState().setShares("bill-a", "item-a", 1);
    store.getState().setNickname("bill-a", "Saba");
    store.getState().resetBill("bill-a");

    expect(store.getState().byBill["bill-a"]).toBeUndefined();
  });

  it("keeps two bills isolated", () => {
    store.getState().setShares("bill-a", "item-a", 1);
    store.getState().setNickname("bill-a", "A");
    store.getState().setShares("bill-b", "item-b", 2);
    store.getState().setNickname("bill-b", "B");
    store.getState().decShares("bill-a", "item-a");

    expect(store.getState().byBill["bill-a"]).toEqual({ selections: {}, nickname: "A" });
    expect(store.getState().byBill["bill-b"]).toEqual({ selections: { "item-b": 2 }, nickname: "B" });
  });
});
