import { render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { ApiProvider } from "./ApiProvider";
import { createApiClient } from "./client";
import { errorMessage } from "./errors";
import { useMe } from "./me";

function Who() {
  const me = useMe();
  if (me.isPending) return <p>Loading…</p>;
  if (me.isError) return <p role="alert">{errorMessage(me.error)}</p>;
  return <p>Role: {me.data.role}</p>;
}

function renderWith(response: () => Response) {
  const fetchMock = vi.fn(async () => response());
  const client = createApiClient({
    baseUrl: "http://api.test",
    getToken: async () => "tok",
    fetch: fetchMock as unknown as typeof fetch,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <ApiProvider client={client} queryClient={queryClient}>
      <Who />
    </ApiProvider>,
  );
  return fetchMock;
}

describe("useMe", () => {
  it("loads the signed-in user through the query layer", async () => {
    const fetchMock = renderWith(() => Response.json({ id: "1", role: "admin" }));
    expect(await screen.findByText("Role: admin")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a user-facing error when the call fails", async () => {
    renderWith(() =>
      Response.json({ error: { code: "not_allowlisted", message: "uid not in users" } }, { status: 403 }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(/ask an admin/i);
  });
});
