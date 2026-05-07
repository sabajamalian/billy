import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SelectionRow } from "@/components/bill/SelectionRow";
import type { BillDto } from "@/lib/dto";

const baseItem: BillDto["items"][number] = {
  id: "item-1",
  name: "Bruschetta",
  quantity: 1,
  unitPriceCents: 1200,
  position: 0,
  confidence: 1,
  flagged: false,
};

describe("SelectionRow + FractionalMenu integration", () => {
  it("opens the menu via the Sharing button and picks a fraction without re-toggling the card", () => {
    const onSharesChange = vi.fn();
    const { rerender } = render(
      <SelectionRow item={baseItem} shares={0} currency="USD" onSharesChange={onSharesChange} />,
    );

    const shareButtons = screen.getAllByRole("button", { name: /Sharing this/ });
    const innerShareButton = shareButtons[shareButtons.length - 1];
    expect(innerShareButton).toBeDefined();
    fireEvent.click(innerShareButton!);

    const thirdButton = screen.getByRole("button", { name: "⅓" });
    fireEvent.click(thirdButton);

    expect(onSharesChange).toHaveBeenCalledTimes(1);
    expect(onSharesChange.mock.calls[0]?.[0]).toBeCloseTo(1 / 3, 5);

    rerender(
      <SelectionRow item={baseItem} shares={1 / 3} currency="USD" onSharesChange={onSharesChange} />,
    );

    const stepperGroup = screen.getByRole("group", { name: /Shares for Bruschetta/ });
    expect(stepperGroup).toHaveTextContent("⅓");
  });
});
