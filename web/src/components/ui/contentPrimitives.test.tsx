import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { LoadingSection } from "@/components/LoadingSection";
import { StatTile } from "@/components/StatTile";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const focusRing = ["focus-visible:ring-[3px]", "focus-visible:ring-ring/35"];

describe("Card", () => {
  it("is the card fill with a border, 14px radius and a section title", () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Spending by category</CardTitle>
        </CardHeader>
        <CardContent>Rows</CardContent>
      </Card>,
    );
    expect(screen.getByTestId("card")).toHaveClass("bg-card", "border", "border-border", "rounded-xl");
    expect(screen.getByText("Spending by category")).toHaveClass("text-lg", "font-semibold");
  });
});

describe("StatTile", () => {
  it("shows the label, the figure in tabular numerals and the sub-text", () => {
    render(<StatTile label="Net income" value="$4,210.00" sub="3 paychecks" tone="income" />);
    const value = screen.getByText("$4,210.00");
    expect(value).toHaveClass("text-[26px]", "font-bold", "tabular-nums", "text-income");
    expect(screen.getByText("Net income")).toHaveClass("uppercase");
    expect(screen.getByText("3 paychecks")).toHaveClass("text-muted-foreground");
    expect(value.closest("[data-slot=stat-tile]")).toHaveAttribute("data-tone", "income");
  });

  it.each([
    ["default", "text-foreground"],
    ["saving", "text-saving"],
    ["refund", "text-refund-text"],
    ["muted", "text-muted-foreground"],
  ] as const)("tone %s colours the figure", (tone, cls) => {
    render(<StatTile label="Spent" value="$0.00" tone={tone} />);
    expect(screen.getByText("$0.00")).toHaveClass(cls);
  });

  it("leaves out the sub-text when there is none", () => {
    const { container } = render(<StatTile label="Spent" value="$1.00" />);
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });
});

describe("Badge", () => {
  it.each([
    ["default", ["bg-primary", "text-primary-foreground"]],
    ["secondary", ["bg-secondary", "text-secondary-foreground"]],
    ["outline", ["border-border", "text-foreground"]],
    ["destructive", ["bg-danger-alert", "text-danger-alert-foreground"]],
    ["refund", ["bg-refund-pill", "text-refund-text"]],
    ["unconfirmed", ["bg-unconfirmed-pill", "text-unconfirmed-text"]],
    ["saving", ["bg-selected", "text-saving"]],
    ["income", ["bg-success-alert", "text-income"]],
    ["worse", ["bg-transparent", "text-worse"]],
    ["better", ["bg-transparent", "text-better"]],
    ["unchanged", ["bg-transparent", "text-muted-foreground"]],
  ] as const)("%s uses its tokens", (variant, classes) => {
    render(<Badge variant={variant}>Tag</Badge>);
    const badge = screen.getByText("Tag");
    expect(badge).toHaveClass(...classes, "rounded-sm", "tabular-nums");
    expect(badge).toHaveAttribute("data-variant", variant);
  });

  it("never carries a hex colour", () => {
    render(<Badge variant="unconfirmed">Not confirmed</Badge>);
    expect(screen.getByText("Not confirmed").className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe("Alert", () => {
  it("an error is an alert on the danger tokens", () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Couldn’t save</AlertTitle>
        <AlertDescription>Check your connection and try again.</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-danger-alert", "border-danger-alert-border", "text-danger-alert-foreground");
    expect(alert).toHaveTextContent("Couldn’t save");
  });

  it.each([
    ["default", ["bg-card", "border-border"]],
    ["success", ["bg-success-alert", "border-success-alert-border", "text-success-alert-foreground"]],
    ["info", ["bg-info-alert", "border-info-alert-border", "text-info-alert-foreground"]],
  ] as const)("%s is a polite status", (variant, classes) => {
    render(<Alert variant={variant}>Backup finished</Alert>);
    expect(screen.getByRole("status")).toHaveClass(...classes);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("takes a role that is passed", () => {
    render(
      <Alert variant="info" role="note">
        Imported entries are added alongside.
      </Alert>,
    );
    expect(screen.getByRole("note")).toHaveTextContent("Imported entries are added alongside.");
  });
});

describe("Table", () => {
  function Expenses() {
    return (
      <Table aria-label="Expenses">
        <TableHeader>
          <TableRow>
            <TableHead>Merchant</TableHead>
            <TableHead numeric>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Corner Shop</TableCell>
            <TableCell numeric>$12.00</TableCell>
          </TableRow>
          <TableRow variant="refund">
            <TableCell>Corner Shop</TableCell>
            <TableCell numeric>−$4.00</TableCell>
          </TableRow>
          <TableRow variant="unconfirmed">
            <TableCell>Power company</TableCell>
            <TableCell numeric>$80.00</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
  }

  it("is a real table that scrolls inside its own box", () => {
    render(<Expenses />);
    const table = screen.getByRole("table", { name: "Expenses" });
    expect(table.parentElement).toHaveClass("overflow-x-auto");
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("right-aligns numeric columns with tabular numerals", () => {
    render(<Expenses />);
    expect(screen.getByRole("columnheader", { name: "Amount" })).toHaveClass("text-right", "tabular-nums");
    expect(screen.getByRole("cell", { name: "$12.00" })).toHaveClass("text-right", "tabular-nums");
    expect(screen.getByRole("columnheader", { name: "Merchant" })).not.toHaveClass("text-right");
  });

  it("tints refund and unconfirmed rows", () => {
    render(<Expenses />);
    const [, plain, refund, unconfirmed] = screen.getAllByRole("row");
    expect(plain).toHaveAttribute("data-variant", "default");
    expect(refund).toHaveClass("bg-refund-row");
    expect(refund).not.toHaveClass("hover:bg-muted/50");
    expect(unconfirmed).toHaveClass("bg-unconfirmed-tint");
  });
});

describe("Tabs", () => {
  function TrendTabs() {
    const [tab, setTab] = useState("custom");
    return (
      <>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Trend views">
            <TabsTrigger value="custom">Custom trends</TabsTrigger>
            <TabsTrigger value="category">By category</TabsTrigger>
          </TabsList>
          <TabsContent value="custom">Saved trends</TabsContent>
          <TabsContent value="category">Biggest movers</TabsContent>
        </Tabs>
        <p data-testid="state">{tab}</p>
      </>
    );
  }

  it("marks the selected tab and shows its panel", () => {
    render(<TrendTabs />);
    expect(screen.getByRole("tablist", { name: "Trend views" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Custom trends" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Saved trends");
  });

  it("moves with the arrow keys and reports the value (controlled, e.g. from the URL)", async () => {
    const user = userEvent.setup();
    render(<TrendTabs />);
    await user.tab();
    expect(screen.getByRole("tab", { name: "Custom trends" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    const byCategory = screen.getByRole("tab", { name: "By category" });
    expect(byCategory).toHaveFocus();
    expect(byCategory).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("state")).toHaveTextContent("category");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Biggest movers");
  });

  it("triggers are 44px with the focus ring", () => {
    render(<TrendTabs />);
    expect(screen.getByRole("tab", { name: "By category" })).toHaveClass("min-h-11", ...focusRing);
  });
});

describe("Toggle and ToggleGroup", () => {
  it("a filter chip is a Toggle with aria-pressed", async () => {
    const user = userEvent.setup();
    render(<Toggle aria-label="Food">Food</Toggle>);
    const chip = screen.getByRole("button", { name: "Food" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveClass("h-11", "data-[state=on]:bg-selected", ...focusRing);
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("a one-of-N choice is a ToggleGroup of radios", async () => {
    const user = userEvent.setup();
    render(
      <ToggleGroup type="single" defaultValue="bars" aria-label="Spending chart">
        <ToggleGroupItem value="bars">Bars</ToggleGroupItem>
        <ToggleGroupItem value="donut">Donut</ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(screen.getByRole("radiogroup", { name: "Spending chart" })).toBeInTheDocument();
    const bars = screen.getByRole("radio", { name: "Bars" });
    const donut = screen.getByRole("radio", { name: "Donut" });
    expect(bars).toHaveAttribute("aria-checked", "true");
    expect(donut).toHaveAttribute("aria-checked", "false");
    await user.click(donut);
    expect(donut).toHaveAttribute("aria-checked", "true");
    expect(bars).toHaveAttribute("aria-checked", "false");
  });

  it("sm is 36px for dense rows", () => {
    render(
      <ToggleGroup type="single" size="sm" aria-label="Measure">
        <ToggleGroupItem value="amount">Amount</ToggleGroupItem>
      </ToggleGroup>,
    );
    expect(screen.getByRole("radio", { name: "Amount" })).toHaveClass("h-9");
  });
});

describe("Progress", () => {
  it("reports the percent and a text alternative", () => {
    render(
      <Progress aria-label="Import progress" value={25} getValueLabel={(v) => `${v}%, 1,200 of 4,800 entries`} />,
    );
    const bar = screen.getByRole("progressbar", { name: "Import progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuetext", "25%, 1,200 of 4,800 entries");
  });

  it("defaults the text alternative to the percent", () => {
    render(<Progress aria-label="Setup progress" value={0} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "0%");
  });
});

describe("Skeleton and LoadingSection", () => {
  it("a skeleton is hidden from assistive tech", () => {
    render(<Skeleton data-testid="bar" />);
    expect(screen.getByTestId("bar")).toHaveAttribute("aria-hidden", "true");
  });

  it("the section is busy and says what is loading", () => {
    render(<LoadingSection label="expenses" rows={4} />);
    const section = screen.getByRole("region", { name: "Loading expenses" });
    expect(section).toHaveAttribute("aria-busy", "true");
    expect(within(section).getByText("Loading expenses…")).toHaveClass("sr-only");
    expect(section.querySelectorAll("[data-slot=skeleton]")).toHaveLength(4);
  });

  it("takes its own skeleton layout", () => {
    render(
      <LoadingSection label="tiles">
        <Skeleton data-testid="tile" />
      </LoadingSection>,
    );
    expect(screen.getByRole("region", { name: "Loading tiles" })).toContainElement(screen.getByTestId("tile"));
  });
});

describe("Tooltip", () => {
  it("opens on focus and describes its trigger, which keeps its own name", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label="Why Rent can't be deleted">
              i
            </button>
          </TooltipTrigger>
          <TooltipContent>It has entries. Rename it instead.</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    await user.tab();
    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("It has entries. Rename it instead.");
    const trigger = screen.getByRole("button", { name: "Why Rent can't be deleted" });
    expect(trigger).toHaveAccessibleDescription("It has entries. Rename it instead.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
