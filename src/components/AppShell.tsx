"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  BrainCircuit,
  CalendarDays,
  CheckSquare,
  ChevronRight,
  FileText,
  FolderKanban,
  Home,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
} from "lucide-react";

export type AppView =
  | "dashboard"
  | "projects"
  | "tasks"
  | "inbox"
  | "ai-brain"
  | "content"
  | "media"
  | "rules"
  | "approvals"
  | "memory"
  | "connectors"
  | "analytics"
  | "automation"
  | "settings";

type AppShellProps = {
  children: ReactNode;
  isReady: boolean;
  isSaving: boolean;
  hasError: boolean;
  title: string;
  subtitle: string;
  notificationCount?: number;
  toolbar?: ReactNode;
  mobileToolbar?: ReactNode;
  onReload: () => void;
};

const navItems: Array<{ href: string; label: string; view: AppView; icon: typeof Home }> = [
  { href: "/dashboard", label: "Dashboard", view: "dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", view: "projects", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", view: "tasks", icon: CheckSquare },
  { href: "/inbox", label: "Inbox", view: "inbox", icon: Inbox },
  { href: "/ai-brain", label: "AI Brain", view: "ai-brain", icon: BrainCircuit },
  { href: "/content", label: "Content", view: "content", icon: CalendarDays },
  { href: "/media", label: "Media", view: "media", icon: ImageIcon },
  { href: "/rules", label: "Rules", view: "rules", icon: ShieldCheck },
  { href: "/approvals", label: "Approvals", view: "approvals", icon: CheckSquare },
  { href: "/memory", label: "Memory", view: "memory", icon: Sparkles },
  { href: "/connectors", label: "Connectors", view: "connectors", icon: Plug },
  { href: "/analytics", label: "Analytics", view: "analytics", icon: BarChart3 },
  { href: "/automation", label: "Automation", view: "automation", icon: Workflow },
  { href: "/settings", label: "Settings", view: "settings", icon: Settings },
];

function statusLabel(isReady: boolean, isSaving: boolean, hasError: boolean) {
  if (hasError) {
    return "Database needs setup";
  }

  if (isSaving) {
    return "Saving";
  }

  return isReady ? "Supabase connected" : "Loading database";
}

export function AppShell({
  children,
  isReady,
  isSaving,
  hasError,
  title,
  subtitle,
  notificationCount = 0,
  toolbar,
  mobileToolbar,
  onReload,
}: AppShellProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isQuickOpen, setIsQuickOpen] = useState(false);

  const notificationBadge = notificationCount > 0 ? (
    <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-emerald-300 px-1 text-[11px] font-semibold leading-none text-zinc-950">
      {notificationCount > 9 ? "9+" : notificationCount}
    </span>
  ) : null;

  const sidebar = (
    <aside
      className={`flex h-full flex-col border-r border-zinc-800 bg-zinc-950 text-zinc-100 transition-[width] duration-200 ${
        isCollapsed ? "w-[76px]" : "w-64"
      }`}
    >
      <div className="flex min-h-16 items-center gap-3 border-b border-zinc-800 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400 text-zinc-950">
          <Users className="h-4 w-4" aria-hidden="true" />
        </div>
        {!isCollapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-400">AI Control Center</p>
            <p className="truncate text-base font-semibold text-zinc-50">Handover Hub</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileOpen(false)}
              title={item.label}
              className={`group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                active
                  ? "bg-zinc-800 text-zinc-50"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              } ${isCollapsed ? "justify-center" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!isCollapsed ? <span className="truncate">{item.label}</span> : null}
              {!isCollapsed && active ? <ChevronRight className="ml-auto h-4 w-4 text-zinc-500" aria-hidden="true" /> : null}
              {isCollapsed ? (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-medium text-zinc-100 opacity-0 shadow-xl shadow-black/30 transition group-hover:opacity-100">
                  {item.label}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-zinc-800 p-3 lg:block">
        <button
          type="button"
          onClick={() => setIsCollapsed((current) => !current)}
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm font-medium text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden="true" /> : <PanelLeftClose className="h-4 w-4" aria-hidden="true" />}
          {!isCollapsed ? "Collapse" : null}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-background text-zinc-100">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block">{sidebar}</div>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-zinc-950/70"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative h-full w-72 max-w-[85vw]">
            <div className="absolute right-3 top-3 z-10">
              <button
                type="button"
                onClick={() => setIsMobileOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-200"
                title="Close navigation"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      ) : null}

      <div className={`min-h-screen transition-[padding] duration-200 ${isCollapsed ? "lg:pl-[76px]" : "lg:pl-64"}`}>
        <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-200 lg:hidden"
              title="Open navigation"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1 lg:max-w-72">
              <p className="truncate text-sm text-zinc-500">{subtitle}</p>
              <h1 className="truncate text-xl font-semibold text-zinc-50 sm:text-2xl">{title}</h1>
            </div>
            {toolbar ? <div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex">{toolbar}</div> : null}
            <div className="hidden items-center gap-3 sm:flex">
              <a
                href="#notifications"
                className="relative inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200"
                aria-label="Notifications"
                title="Notifications"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                Notifications
                {notificationBadge}
              </a>
              <div className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-400">
                <Save className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                <span>{statusLabel(isReady, isSaving, hasError)}</span>
              </div>
              <button
                type="button"
                onClick={onReload}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200"
                title="Reload from Supabase"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reload
              </button>
            </div>
          </div>
          {toolbar || mobileToolbar ? <div className="flex gap-2 border-t border-zinc-900 px-4 py-2 lg:hidden">{mobileToolbar ?? toolbar}</div> : null}
          <div className="flex gap-2 border-t border-zinc-900 px-4 py-2 sm:hidden">
            <a
              href="#notifications"
              className="relative inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-800 px-3 text-zinc-100"
              aria-label="Notifications"
              title="Notifications"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {notificationBadge}
            </a>
            <div className="inline-flex min-h-9 flex-1 items-center gap-2 rounded-lg border border-zinc-800 px-3 text-xs text-zinc-400">
              <Save className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <span>{statusLabel(isReady, isSaving, hasError)}</span>
            </div>
            <button
              type="button"
              onClick={onReload}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-100"
              title="Reload from Supabase"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload
            </button>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
        {isQuickOpen ? (
          <div className="w-56 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/40">
            <Link
              href="/tasks"
              onClick={() => setIsQuickOpen(false)}
              className="flex min-h-11 items-center gap-3 border-b border-zinc-900 px-3 text-sm font-medium text-zinc-100 transition hover:bg-zinc-900"
            >
              <CheckSquare className="h-4 w-4 text-sky-300" aria-hidden="true" />
              New Task
            </Link>
            <Link
              href="/content"
              onClick={() => setIsQuickOpen(false)}
              className="flex min-h-11 items-center gap-3 border-b border-zinc-900 px-3 text-sm font-medium text-zinc-100 transition hover:bg-zinc-900"
            >
              <CalendarDays className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              New Content
            </Link>
            <Link
              href="/projects"
              onClick={() => setIsQuickOpen(false)}
              className="flex min-h-11 items-center gap-3 border-b border-zinc-900 px-3 text-sm font-medium text-zinc-100 transition hover:bg-zinc-900"
            >
              <FolderKanban className="h-4 w-4 text-amber-300" aria-hidden="true" />
              New Project
            </Link>
            <Link
              href="/ai-brain"
              onClick={() => setIsQuickOpen(false)}
              className="flex min-h-11 items-center gap-3 px-3 text-sm font-medium text-zinc-100 transition hover:bg-zinc-900"
            >
              <FileText className="h-4 w-4 text-violet-300" aria-hidden="true" />
              Generate Draft
            </Link>
            <Link
              href="/media"
              onClick={() => setIsQuickOpen(false)}
              className="flex min-h-11 items-center gap-3 border-t border-zinc-900 px-3 text-sm font-medium text-zinc-100 transition hover:bg-zinc-900"
            >
              <ImageIcon className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              Media Library
            </Link>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsQuickOpen((current) => !current)}
          aria-expanded={isQuickOpen}
          aria-label="Quick actions"
          className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400 text-zinc-950 shadow-2xl shadow-emerald-950/40 transition hover:bg-emerald-300"
          title="Quick actions"
        >
          <Plus className={`h-6 w-6 transition ${isQuickOpen ? "rotate-45" : ""}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
