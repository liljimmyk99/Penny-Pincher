import {
  ChevronUp,
  Download,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Shield,
  Sun,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useMe } from "../api";
import { useSession } from "../auth";
import { Toast } from "../components/Toast";
import { useTheme } from "../theme/context";
import { isThemePreference, type ThemePreference } from "../theme/theme";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { displayName, isAdmin } from "./me";
import { ADMIN_PATH, EXPORT_PATH, IMPORT_PATH, SETTINGS_PATH } from "./navigation";
import { isApplePlatform } from "./platform";

const THEMES: { value: ThemePreference; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/** Links inside the menu keep the menu's text colour, not the link colour. */
const linkItem = "text-inherit no-underline";

function Hint({ children }: { children: string }) {
  return (
    <span className="ml-auto text-xs font-semibold text-muted-foreground" aria-hidden="true">
      {children}
    </span>
  );
}

/** A round initial for the signed-in user. Decorative: the name is always shown next to it. */
function UserAvatar({ name, size = "default" }: { name: string; size?: "default" | "lg" }) {
  const initial = name.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() ?? "?";
  return (
    <Avatar size={size} aria-hidden="true">
      <AvatarFallback className="bg-primary font-semibold text-primary-foreground group-data-[size=lg]/avatar:text-[15px]">
        {initial}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * The account button at the foot of the sidebar and its menu (#172, V2
 * "Account menu"): who is signed in (name and username), Appearance, Settings,
 * Import transactions, Export data, Admin dashboard (admins only), Change
 * password, Sign out. Radix supplies the menu behaviour (focus, arrow keys,
 * Esc, outside click).
 */
export function AccountMenu({ collapsed }: { collapsed: boolean }) {
  const me = useMe().data;
  const session = useSession();
  const { preference, setPreference } = useTheme();
  const name = displayName(me);
  const admin = isAdmin(me);
  const apple = isApplePlatform();
  const [changing, setChanging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                title={collapsed ? name : undefined}
                className="cursor-pointer px-2.5 text-sidebar-foreground data-[state=open]:bg-sidebar-hover"
              >
                <UserAvatar name={name} />
                <span className="flex min-w-0 flex-1 flex-col gap-px group-data-[collapsible=icon]:sr-only">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="text-xs font-semibold text-sidebar-muted-foreground">
                    {admin ? "Admin" : "Member"}
                  </span>
                </span>
                <ChevronUp
                  aria-hidden="true"
                  className="size-4! text-sidebar-muted-foreground group-data-[collapsible=icon]:hidden"
                />
              </SidebarMenuButton>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              // Radix labels the menu by its trigger (name + role); "Account" reads better.
              aria-label="Account"
              aria-labelledby={undefined}
              side="top"
              align="start"
              sideOffset={8}
              collisionPadding={12}
              className="w-[300px] p-2"
            >
              <div className="flex items-center gap-3 px-3 pt-2.5 pb-3">
                <UserAvatar name={name} size="lg" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{name}</span>
                  {/* The username, unless the name above already is it. */}
                  {me?.username && me.username !== name && (
                    <span className="truncate text-[13px] text-muted-foreground">{me.username}</span>
                  )}
                </span>
              </div>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="px-2 pt-2 pb-2 text-[13px] font-medium text-muted-foreground">
                Appearance
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                aria-label="Appearance"
                className="grid grid-cols-3 gap-1.5 px-1 pb-1.5"
                value={preference}
                onValueChange={(value) => {
                  if (isThemePreference(value)) setPreference(value);
                }}
              >
                {THEMES.map(({ value, label, Icon }) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    // Keep the menu open so the change can be seen and undone.
                    onSelect={(event) => event.preventDefault()}
                    className={cn(
                      "min-h-14 flex-col justify-center gap-1 rounded-lg border border-border px-2 text-xs font-semibold [&>span:first-child]:hidden",
                      "data-[state=checked]:border-primary data-[state=checked]:bg-selected data-[state=checked]:text-selected-foreground data-[state=checked]:ring-1 data-[state=checked]:ring-primary data-[state=checked]:ring-inset",
                      "[&_svg]:size-[18px]! data-[state=checked]:[&_svg]:text-current!",
                    )}
                  >
                    <Icon aria-hidden="true" />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>

              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className={linkItem}>
                <Link to={SETTINGS_PATH} aria-keyshortcuts={apple ? "Meta+," : "Control+,"}>
                  <Settings aria-hidden="true" />
                  Settings
                  <Hint>{apple ? "⌘ ," : "Ctrl+,"}</Hint>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className={linkItem}>
                <Link to={IMPORT_PATH}>
                  <Upload aria-hidden="true" />
                  Import transactions
                  <Hint>Excel</Hint>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className={linkItem}>
                <Link to={EXPORT_PATH}>
                  <Download aria-hidden="true" />
                  Export data
                  <Hint>CSV or Excel</Hint>
                </Link>
              </DropdownMenuItem>
              {admin && (
                <DropdownMenuItem asChild className={linkItem}>
                  <Link to={ADMIN_PATH}>
                    <Shield aria-hidden="true" />
                    Admin dashboard
                    {/* The orange tag of the V2 board, on the unconfirmed pill tokens. */}
                    <Badge variant="unconfirmed" className="ml-auto" aria-hidden="true">
                      Admin
                    </Badge>
                  </Link>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setChanging(true)}>
                <Lock aria-hidden="true" />
                Change password
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-danger-alert-foreground focus:text-danger-alert-foreground"
                onSelect={() => {
                  // The session turns signed out and AuthGate shows the sign-in screen.
                  session.signOut().catch(() => {});
                }}
              >
                <LogOut aria-hidden="true" className="text-current" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {changing && (
        <ChangePasswordDialog
          onClose={() => setChanging(false)}
          onChanged={() => {
            setChanging(false);
            setToast("Password changed");
          }}
        />
      )}
      <Toast message={toast} onDismiss={dismissToast} />
    </>
  );
}
