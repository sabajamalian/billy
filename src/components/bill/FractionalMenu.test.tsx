import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FractionalMenu } from "@/components/bill/FractionalMenu";

describe("FractionalMenu", () => {
  it("calls onPick with 1/3 when ⅓ button is clicked", () => {
    const onPick = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <FractionalMenu
        open={true}
        onOpenChange={onOpenChange}
        current={0}
        maxShares={1}
        onPick={onPick}
      />,
    );

    const thirdButton = screen.getByRole("button", { name: "⅓" });
    fireEvent.click(thirdButton);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).toBeCloseTo(1 / 3, 5);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clamps a 1.5 pick to maxShares=1", () => {
    const onPick = vi.fn();

    render(
      <FractionalMenu
        open={true}
        onOpenChange={() => {}}
        current={0}
        maxShares={1}
        onPick={onPick}
      />,
    );

    const oneAndHalf = screen.queryByRole("button", { name: "1½" });
    expect(oneAndHalf).not.toBeNull();
    expect(oneAndHalf).toBeDisabled();
  });

  it("disables options exceeding maxShares but enables fractions ≤ max", () => {
    render(
      <FractionalMenu
        open={true}
        onOpenChange={() => {}}
        current={0}
        maxShares={1}
        onPick={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "¼" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "⅓" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "½" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "⅔" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "¾" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "1" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "1½" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "2" })).toBeDisabled();
  });
});
