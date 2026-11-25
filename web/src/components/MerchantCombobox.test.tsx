import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { vi } from "vitest";
import { ApiProvider, createApiClient, type Schemas } from "../api";
import { MerchantCombobox } from "./MerchantCombobox";

const merchants: Schemas["Merchant"][] = [
  { id: "m1", name: "Corner Coffee" },
  { id: "m2", name: "Corner Store" },
  { id: "m3", name: "Bakery" },
] as Schemas["Merchant"][];

function fakeFetch(req: Request) {
  const url = new URL(req.url);
  if (url.pathname === "/v1/merchants") {
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    return Promise.resolve(
      Response.json({ items: merchants.filter((m) => m.name.toLowerCase().startsWith(q)), next_cursor: null }),
    );
  }
  return Promise.resolve(Response.json({}, { status: 404 }));
}

function renderCombo() {
  const onPick = vi.fn();
  const onCommit = vi.fn();
  const onKeyDown = vi.fn();
  function Harness() {
    const [value, setValue] = useState("");
    return (
      <>
        <label htmlFor="m">Merchant field</label>
        <MerchantCombobox
          id="m"
          label="Merchant"
          value={value}
          invalid={false}
          onChange={setValue}
          onPick={(m) => {
            setValue(m.name);
            onPick(m);
          }}
          onCommit={onCommit}
          onKeyDown={onKeyDown}
        />
        <button type="button">Next</button>
      </>
    );
  }
  const client = createApiClient({
    baseUrl: "http://api.test",
    getToken: () => "tok",
    fetch: fakeFetch as unknown as typeof fetch,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={client} queryClient={queryClient}>
      <Harness />
    </ApiProvider>,
  );
  return { user: userEvent.setup(), onPick, onCommit, onKeyDown };
}

const input = () => screen.getByRole("combobox", { name: "Merchant" });
const list = () => screen.findByRole("listbox", { name: "Past merchants" });
const noList = () => expect(screen.queryByRole("listbox", { name: "Past merchants" })).not.toBeInTheDocument();
const optionNames = async () => within(await list()).getAllByRole("option").map((o) => o.textContent);

describe("MerchantCombobox", () => {
  it("keeps the input labelled by its own id and collapsed until typing", () => {
    renderCombo();
    expect(screen.getByLabelText("Merchant field")).toBe(input());
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(input()).toHaveAttribute("aria-autocomplete", "list");
    expect(input()).not.toHaveAttribute("aria-activedescendant");
  });

  it("suggests past merchants case-insensitively, with Create for a new name", async () => {
    const { user } = renderCombo();
    await user.type(input(), "CORN");
    expect(await optionNames()).toEqual(["Corner Coffee", "Corner Store", "Create “CORN”"]);
    expect(input()).toHaveAttribute("aria-expanded", "true");
    expect(input()).toHaveAttribute("aria-controls", (await list()).id);
    expect(input()).not.toHaveAttribute("aria-activedescendant");
  });

  it("offers no Create for an existing name in another case", async () => {
    const { user } = renderCombo();
    await user.type(input(), "corner store");
    // The only suggestion is the name already typed, so the list stays closed.
    await waitFor(() => expect(input()).toHaveAttribute("aria-expanded", "false"));
    noList();
  });

  it("moves with the arrow keys and picks with Enter", async () => {
    const { user, onPick, onKeyDown } = renderCombo();
    await user.type(input(), "cor");
    const options = within(await list()).getAllByRole("option");

    await user.keyboard("{ArrowDown}");
    expect(input()).toHaveAttribute("aria-activedescendant", options[0].id);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(input()).toHaveAttribute("aria-activedescendant", options[1].id);
    await user.keyboard("{ArrowUp}{ArrowUp}");
    // Up from the first wraps through "nothing highlighted".
    expect(input()).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{ArrowUp}");
    expect(input()).toHaveAttribute("aria-activedescendant", options[2].id);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onPick).toHaveBeenCalledWith(merchants[0]);
    expect(input()).toHaveValue("Corner Coffee");
    expect(input()).toHaveFocus();
    noList();
    expect(onKeyDown).not.toHaveBeenCalledWith(expect.objectContaining({ key: "Enter" }));
  });

  it("passes Enter on when nothing is highlighted, so fast entry moves on", async () => {
    const { user, onPick, onKeyDown } = renderCombo();
    await user.type(input(), "cor");
    await list();
    await user.keyboard("{Enter}");
    expect(onPick).not.toHaveBeenCalled();
    expect(onKeyDown).toHaveBeenCalledWith(expect.objectContaining({ key: "Enter" }));
    expect(input()).toHaveValue("cor");
  });

  it("keeps a new name with Create", async () => {
    const { user, onPick, onCommit } = renderCombo();
    await user.type(input(), "Corn Mill");
    expect(await optionNames()).toEqual(["Create “Corn Mill”"]);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onPick).not.toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(input()).toHaveValue("Corn Mill");
    noList();
  });

  it("closes with Escape and reopens with ArrowDown", async () => {
    const { user } = renderCombo();
    await user.type(input(), "cor");
    await list();
    await user.keyboard("{Escape}");
    noList();
    expect(input()).toHaveAttribute("aria-expanded", "false");
    expect(input()).not.toHaveAttribute("aria-controls");
    await user.keyboard("{ArrowDown}");
    await list();
  });

  it("picks with the mouse without taking focus from the input", async () => {
    const { user, onPick } = renderCombo();
    await user.type(input(), "cor");
    await user.click(within(await list()).getByRole("option", { name: "Corner Store" }));
    expect(onPick).toHaveBeenCalledWith(merchants[1]);
    expect(input()).toHaveFocus();
    noList();
  });

  it("closes and commits when focus leaves", async () => {
    const { user, onCommit } = renderCombo();
    await user.type(input(), "cor");
    await list();
    await user.tab();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    expect(onCommit).toHaveBeenCalled();
    noList();
  });
});
