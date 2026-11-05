import { NavLink } from "react-router";
import { Brand } from "../components/Brand";
import { ChevronsLeftIcon } from "../components/icons";
import { AccountMenu } from "./AccountMenu";
import { NAV_ITEMS } from "./navigation";
import "./Sidebar.css";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

/**
 * The dark left sidebar: brand, collapse toggle, the main navigation and the
 * account menu. Collapsed, it is an icon rail; labels stay in the
 * accessibility tree (visually hidden) so links keep their names.
 */
export function Sidebar({ collapsed, onToggle }: Props) {
  return (
    <div className={collapsed ? "sidebar sidebar--collapsed" : "sidebar"}>
      <div className="sidebar__head">
        <Brand size="sm" />
        <button
          type="button"
          className="sidebar__toggle"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          aria-controls="main-nav"
          onClick={onToggle}
        >
          <ChevronsLeftIcon />
        </button>
      </div>

      <nav id="main-nav" className="sidebar__nav" aria-label="Main">
        <ul className="sidebar__list">
          {NAV_ITEMS.map(({ path, label, Icon }) => (
            <li key={path}>
              {/* NavLink sets aria-current="page" on the active item. */}
              <NavLink to={path} className="sidebar__link" title={collapsed ? label : undefined}>
                <Icon />
                <span className="sidebar__label">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar__account">
        <AccountMenu collapsed={collapsed} />
      </div>
    </div>
  );
}
