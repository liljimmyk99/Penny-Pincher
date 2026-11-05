import { Page } from "./Page";

/** Stands in for a screen that later issues build. */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <Page title={title}>
      <section className="card placeholder">
        <p>{description}</p>
        <p>This screen isn't built yet.</p>
      </section>
    </Page>
  );
}
