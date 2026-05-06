"use client";

import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { setShares as applyShares } from "@/lib/bill-math";

export type BillSelectionState = {
  selections: Record<string, number>;
  nickname: string;
};

export type SelectionsState = {
  byBill: Record<string, BillSelectionState>;
  setShares(billId: string, itemId: string, shares: number): void;
  incShares(billId: string, itemId: string, delta?: number): void;
  decShares(billId: string, itemId: string, delta?: number): void;
  setNickname(billId: string, name: string): void;
  pruneStaleForBill(billId: string, validItemIds: string[]): void;
  resetBill(billId: string): void;
};

const emptyBillState = (): BillSelectionState => ({ selections: {}, nickname: "" });
const EMPTY_BILL_SELECTION_STATE: BillSelectionState = { selections: {}, nickname: "" };

const getBillState = (state: SelectionsState, billId: string): BillSelectionState =>
  state.byBill[billId] ?? emptyBillState();

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const clampShares = (shares: number): number => (Number.isFinite(shares) && shares > 0 ? shares : 0);

export const useSelectionsStore: UseBoundStore<StoreApi<SelectionsState>> = create<SelectionsState>()(
  persist(
    (set, get) => ({
      byBill: {},
      setShares: (billId, itemId, shares) => {
        set((state) => {
          const current = getBillState(state, billId);
          const selections = applyShares(current.selections, itemId, clampShares(shares));

          return {
            byBill: {
              ...state.byBill,
              [billId]: { ...current, selections },
            },
          };
        });
      },
      incShares: (billId, itemId, delta = 1) => {
        const current = getBillState(get(), billId).selections[itemId] ?? 0;
        get().setShares(billId, itemId, current + delta);
      },
      decShares: (billId, itemId, delta = 1) => {
        const current = getBillState(get(), billId).selections[itemId] ?? 0;
        get().setShares(billId, itemId, Math.max(0, current - delta));
      },
      setNickname: (billId, name) => {
        set((state) => {
          const current = getBillState(state, billId);

          return {
            byBill: {
              ...state.byBill,
              [billId]: { ...current, nickname: name.trim().slice(0, 30) },
            },
          };
        });
      },
      pruneStaleForBill: (billId, validItemIds) => {
        set((state) => {
          const current = getBillState(state, billId);
          const valid = new Set(validItemIds);
          const selections = Object.fromEntries(
            Object.entries(current.selections).filter(([itemId, shares]) => valid.has(itemId) && shares > 0),
          );

          return {
            byBill: {
              ...state.byBill,
              [billId]: { ...current, selections },
            },
          };
        });
      },
      resetBill: (billId) => {
        set((state) => {
          const { [billId]: _removed, ...byBill } = state.byBill;
          void _removed;
          return { byBill };
        });
      },
    }),
    {
      name: "billy:selections:v1",
      storage: createJSONStorage(() => (typeof window === "undefined" ? noopStorage : localStorage)),
      partialize: (state) => ({ byBill: state.byBill }),
    },
  ),
);

export function useBillSelections(billId: string): BillSelectionState {
  return useSelectionsStore(
    useShallow((state) => state.byBill[billId] ?? EMPTY_BILL_SELECTION_STATE),
  );
}

export function useSetShares(): (billId: string, itemId: string, shares: number) => void {
  return useSelectionsStore((state) => state.setShares);
}

export function useIncShares(): (billId: string, itemId: string, delta?: number) => void {
  return useSelectionsStore((state) => state.incShares);
}

export function useDecShares(): (billId: string, itemId: string, delta?: number) => void {
  return useSelectionsStore((state) => state.decShares);
}

export function useSetNickname(): (billId: string, name: string) => void {
  return useSelectionsStore((state) => state.setNickname);
}

export function usePruneStaleForBill(): (billId: string, validItemIds: string[]) => void {
  return useSelectionsStore((state) => state.pruneStaleForBill);
}

export function useResetBill(): (billId: string) => void {
  return useSelectionsStore((state) => state.resetBill);
}
