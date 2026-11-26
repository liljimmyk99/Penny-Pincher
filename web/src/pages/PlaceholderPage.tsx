import { Card } from "@/components/ui/card";
import { Page } from "./Page";

/** Stands in for a screen that later issues build. */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <Page title={title}>
      <Card className="gap-2 p-6 text-muted-foreground">
        <p className="m-0">{description}</p>
        <p className="m-0">This screen isn't built yet.</p>
      </Card>
    </Page>
  );
}
