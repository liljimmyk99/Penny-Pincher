import { Link } from "react-router";
import { Card } from "@/components/ui/card";
import { Page } from "./Page";

export function NotFoundPage() {
  return (
    <Page title="Page not found">
      <Card className="gap-2 p-6 text-muted-foreground">
        <p className="m-0">There's nothing at this address.</p>
        <p className="m-0">
          <Link to="/summary">Go to Summary</Link>
        </p>
      </Card>
    </Page>
  );
}
