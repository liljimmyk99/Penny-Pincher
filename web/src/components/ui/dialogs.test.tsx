import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function EditExample({ showCloseButton }: { showCloseButton?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger>Edit expense</DialogTrigger>
      <DialogContent showCloseButton={showCloseButton}>
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription>Change any field, then save.</DialogDescription>
        </DialogHeader>
        <input aria-label="Amount" />
        <DialogFooter>
          <DialogClose>Cancel</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("is a modal dialog named and described by its title and description", async () => {
    const user = userEvent.setup();
    render(<EditExample />);
    await user.click(screen.getByRole("button", { name: "Edit expense" }));
    const dialog = screen.getByRole("dialog", { name: "Edit expense" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Change any field, then save.");
  });

  it("is centred without a transform, fits a phone screen and scrolls when tall", async () => {
    const user = userEvent.setup();
    render(<EditExample />);
    await user.click(screen.getByRole("button", { name: "Edit expense" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveClass("fixed", "inset-0", "m-auto", "h-fit", "w-[min(480px,calc(100vw-32px))]", "overflow-auto");
    expect(dialog.className).not.toMatch(/translate/);
    expect(dialog).toHaveClass("bg-card", "shadow-[var(--shadow-dialog)]");
  });

  it("closes on Esc and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    render(<EditExample />);
    const trigger = screen.getByRole("button", { name: "Edit expense" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("returns focus to the button that opened it from state, with no DialogTrigger", async () => {
    function FromState() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Edit expense Corner Market
          </button>
          {open && (
            <Dialog open onOpenChange={(next) => !next && setOpen(false)}>
              <DialogContent>
                <DialogTitle>Edit expense</DialogTitle>
                <DialogDescription>Change any field, then save.</DialogDescription>
              </DialogContent>
            </Dialog>
          )}
        </>
      );
    }
    const user = userEvent.setup();
    render(<FromState />);
    const opener = screen.getByRole("button", { name: "Edit expense Corner Market" });
    await user.click(opener);
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("leaves focus alone when another dialog opens in its place", async () => {
    function Handoff() {
      const [step, setStep] = useState<"none" | "apply" | "reset">("none");
      return (
        <>
          <button type="button" onClick={() => setStep("apply")}>
            Apply a template…
          </button>
          <Dialog open={step === "apply"} onOpenChange={(next) => !next && setStep("none")}>
            <DialogContent>
              <DialogTitle>Apply a template</DialogTitle>
              <DialogDescription>Pick one.</DialogDescription>
              <button type="button" onClick={() => setStep("reset")}>
                Copy into March
              </button>
            </DialogContent>
          </Dialog>
          <AlertDialog open={step === "reset"} onOpenChange={(next) => !next && setStep("none")}>
            <AlertDialogContent>
              <AlertDialogTitle>Replace everything in March?</AlertDialogTitle>
              <AlertDialogDescription>All entries are deleted.</AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Handoff />);
    await user.click(screen.getByRole("button", { name: "Apply a template…" }));
    await user.click(screen.getByRole("button", { name: "Copy into March" }));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("has a 44px Close button by default, which closes it", async () => {
    const user = userEvent.setup();
    render(<EditExample />);
    await user.click(screen.getByRole("button", { name: "Edit expense" }));
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveClass("size-11");
    await user.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can leave the Close button out", async () => {
    const user = userEvent.setup();
    render(<EditExample showCloseButton={false} />);
    await user.click(screen.getByRole("button", { name: "Edit expense" }));
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("follows a controlled open state", () => {
    function Controlled() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>Income</DialogTitle>
            <DialogDescription>Entries this month.</DialogDescription>
          </DialogContent>
        </Dialog>
      );
    }
    render(<Controlled />);
    expect(screen.getByRole("dialog", { name: "Income" })).toBeInTheDocument();
  });
});

function DeleteExample({ onConfirm = () => {} }: { onConfirm?: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger>Delete category</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <svg />
          </AlertDialogMedia>
          <div>
            <AlertDialogTitle>Delete “Food”?</AlertDialogTitle>
            <AlertDialogDescription>Its expenses move to Other.</AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete and move to Other</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("AlertDialog", () => {
  it("is a modal alertdialog named and described by its title and description, with no Close button", async () => {
    const user = userEvent.setup();
    render(<DeleteExample />);
    await user.click(screen.getByRole("button", { name: "Delete category" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete “Food”?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Its expenses move to Other.");
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("puts the focus on Cancel", async () => {
    const user = userEvent.setup();
    render(<DeleteExample />);
    await user.click(screen.getByRole("button", { name: "Delete category" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("cancels on Esc and returns focus to its trigger", async () => {
    const user = userEvent.setup();
    render(<DeleteExample />);
    const trigger = screen.getByRole("button", { name: "Delete category" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("makes the action a destructive button and Cancel an outline one", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<DeleteExample onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Delete category" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("data-variant", "outline");
    const action = screen.getByRole("button", { name: "Delete and move to Other" });
    expect(action).toHaveAttribute("data-variant", "destructive");
    expect(action).toHaveClass("h-11", "bg-destructive");
    await user.click(action);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("hides the icon tile from assistive technology", async () => {
    const user = userEvent.setup();
    render(<DeleteExample />);
    await user.click(screen.getByRole("button", { name: "Delete category" }));
    const media = document.querySelector("[data-slot=alert-dialog-media]");
    expect(media).toHaveAttribute("aria-hidden", "true");
    expect(media).toHaveClass("size-11", "bg-danger-alert", "text-danger-alert-foreground");
  });
});
