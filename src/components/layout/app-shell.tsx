import { NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3,
  ClipboardCheck,
  FolderUp,
  Home,
  Landmark,
  ListChecks,
  Settings,
  ShoppingBag,
  Sparkles,
  Tags,
  Workflow,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/transactions', label: 'Transactions', icon: ListChecks },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/statements', label: 'Statements', icon: FolderUp },
  { to: '/merchants', label: 'Merchants', icon: ShoppingBag },
  { to: '/categories', label: 'Categories', icon: Landmark },
  { to: '/tags', label: 'Tags', icon: Tags },
  { to: '/rules', label: 'Rules', icon: Workflow },
  { to: '/review', label: 'Review Queue', icon: ClipboardCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  return (
    <div className="flex min-h-screen text-(--text-primary)">
      <aside className="w-64 border-r border-white/50 bg-white/60 p-4 backdrop-blur-md">
        <div className="mb-6 rounded-2xl border border-violet-100 bg-linear-to-br from-violet-100/80 via-fuchsia-100/70 to-sky-100/70 p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/75 text-violet-700 shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <h1 className="text-lg font-bold">OpenSpend</h1>
          </div>
          <p className="mt-1 text-xs text-slate-600">Local-first AMEX analytics</p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-linear-to-r from-indigo-400/95 via-violet-400/95 to-fuchsia-400/95 text-white shadow-md shadow-violet-200/70'
                      : 'text-slate-700 hover:bg-white/80',
                  )
                }
              >
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-linear-to-br from-violet-100 to-sky-100 text-violet-700"
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {item.label}
              </NavLink>
            )
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
