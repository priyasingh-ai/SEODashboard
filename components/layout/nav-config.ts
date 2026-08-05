import {
  BarChart3,
  Bot,
  FileSearch,
  FileText,
  LayoutGrid,
  Search,
  Settings,
  Sparkles,
  Swords,
  Tags,
  Target,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Site-scoped routes carry the selected website in `?site=`; the portfolio and
   * settings are global and don't.
   */
  scoped: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Portfolio", icon: LayoutGrid, scoped: false },
  { href: "/copilot", label: "AI Copilot", icon: Bot, scoped: true },
  { href: "/action-center", label: "Action Center", icon: Target, scoped: true },
  { href: "/search-console", label: "Search Console", icon: Search, scoped: true },
  { href: "/analytics", label: "Google Analytics", icon: BarChart3, scoped: true },
  { href: "/landing-pages", label: "Landing Pages", icon: FileText, scoped: true },
  { href: "/keywords", label: "Keywords", icon: Tags, scoped: true },
  { href: "/content", label: "Content Health", icon: FileSearch, scoped: true },
  { href: "/geo", label: "GEO Monitoring", icon: Sparkles, scoped: true },
  { href: "/competitors", label: "Competitors", icon: Swords, scoped: true },
  { href: "/technical", label: "Technical SEO", icon: Wrench, scoped: true },
  { href: "/settings", label: "Settings", icon: Settings, scoped: false },
];
