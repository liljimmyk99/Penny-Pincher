import { ThemeSwitch } from "./theme/ThemeSwitch";
import "./App.css";

/** Placeholder shell; the sidebar and screens arrive in later issues. */
export function App() {
  return (
    <main className="app">
      <header className="app__header">
        <h1>Penny Pincher</h1>
        <ThemeSwitch />
      </header>
      <section className="card app__card">
        <h2>Spend tracker</h2>
        <p className="eyebrow">Web app scaffold</p>
      </section>
    </main>
  );
}
