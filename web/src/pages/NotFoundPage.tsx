import { Link } from "react-router";
import { Page } from "./Page";

export function NotFoundPage() {
  return (
    <Page title="Page not found">
      <section className="card placeholder">
        <p>There's nothing at this address.</p>
        <p>
          <Link to="/summary">Go to Summary</Link>
        </p>
      </section>
    </Page>
  );
}
