import * as Menu from "@radix-ui/react-dropdown-menu";
import { Link } from "react-router";
import { useMe } from "../api";
import { useSession } from "../auth";
import {
  ChevronUpIcon,
  DownloadIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  ShieldIcon,
  SignOutIcon,
  SunIcon,
} from "../components/icons";
import { useTheme } from "../theme/context";
import { isThemePreference, type ThemePreference } from "../theme/theme";
import { Avatar } from "./Avatar";
import { displayName, isAdmin } from "./me";
import { ADMIN_PATH, EXPORT_PATH, SETTINGS_PATH } from "./navigation";
import { isApplePlatform } from "./platform";
import "./AccountMenu.css";

const THEMES: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

/**
 * The account button at the foot of the sidebar and its menu: who is signed
 * in, Appearance, Settings, Export data, Admin dashboard (admins only), Sign out.
 * Radix supplies the menu behaviour (focus, arrow keys, Esc, outside click).
 */
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const me = useMe().data;
  const session = useSession();
  const { preference, setPreference } = useTheme();
  const name = displayName(me);
  const apple = isApplePlatform();

  return (
    <Menu.Root>
      <Menu.Trigger className="account-button" title={collapsed ? name : undefined}>
        <Avatar name={name} />
        <span className="account-button__who">
          <span className="account-button__name">{name}</span>
          <span className="account-button__role">{isAdmin(me) ? "Admin" : "Member"}</span>
        </span>
        <ChevronUpIcon className="account-button__chevron" width={16} height={16} />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Content
          className="account-menu"
          aria-label="Account"
          // Radix labels the menu by its trigger (name + role); "Account" reads better.
          aria-labelledby={undefined}
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
        >
          <div className="account-menu__who">
            <Avatar name={name} size="lg" />
            <span className="account-menu__identity">
              <span className="account-menu__name">{name}</span>
              {me?.email && <span className="account-menu__email">Signed in · {me.email}</span>}
            </span>
          </div>

          <Menu.Separator className="account-menu__separator" />
          <Menu.Label className="account-menu__label">Appearance</Menu.Label>
          <Menu.RadioGroup
            className="account-menu__themes"
            aria-label="Appearance"
            value={preference}
            onValueChange={(value) => {
              if (isThemePreference(value)) setPreference(value);
            }}
          >
            {THEMES.map(({ value, label, Icon }) => (
              <Menu.RadioItem
                key={value}
                value={value}
                className="account-menu__theme"
                // Keep the menu open so the change can be seen and undone.
                onSelect={(event) => event.preventDefault()}
              >
                <Icon />
                {label}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>

          <Menu.Separator className="account-menu__separator" />
          <Menu.Item asChild className="account-menu__item">
            <Link to={SETTINGS_PATH} aria-keyshortcuts={apple ? "Meta+," : "Control+,"}>
              <SettingsIcon />
              Settings
              <span className="account-menu__hint" aria-hidden="true">
                {apple ? "⌘ ," : "Ctrl+,"}
              </span>
            </Link>
          </Menu.Item>
          <Menu.Item asChild className="account-menu__item">
            <Link to={EXPORT_PATH}>
              <DownloadIcon />
              Export data
              <span className="account-menu__hint" aria-hidden="true">
                CSV or Excel
              </span>
            </Link>
          </Menu.Item>
          {isAdmin(me) && (
            <Menu.Item asChild className="account-menu__item">
              <Link to={ADMIN_PATH}>
                <ShieldIcon />
                Admin dashboard
                <span className="account-menu__tag" aria-hidden="true">
                  Admin
                </span>
              </Link>
            </Menu.Item>
          )}

          <Menu.Separator className="account-menu__separator" />
          <Menu.Item
            className="account-menu__item"
            onSelect={() => {
              // Firebase reports the sign-out and AuthGate shows the sign-in screen.
              session.signOut().catch(() => {});
            }}
          >
            <SignOutIcon />
            Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
