import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { toast } from "../../lib/toast";
import { Toaster } from "./sonner";

describe("Toaster and toast()", () => {
  it("shows a confirmation in the polite Notifications region, dismissible", async () => {
    render(<Toaster />);
    const region = screen.getByRole("region", { name: /^Notifications/ });
    expect(region).toHaveAttribute("aria-live", "polite");

    act(() => {
      toast("Refund linked");
    });
    expect(await within(region).findByText("Refund linked")).toBeInTheDocument();
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();

    await userEvent.click(within(region).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText("Refund linked")).not.toBeInTheDocument());
  });

  it("announces errors assertively", async () => {
    render(<Toaster />);
    act(() => {
      toast.error("Backup failed");
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Backup failed");
  });

  it("runs an action such as Undo and closes the toast", async () => {
    const onClick = vi.fn();
    render(<Toaster />);
    act(() => {
      toast("Copied 3 items into April", { action: { label: "Undo", onClick } });
    });
    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(onClick).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByText("Copied 3 items into April")).not.toBeInTheDocument());
  });
});
