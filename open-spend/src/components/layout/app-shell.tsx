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
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="w-64 border-r border-slate-200 bg-white p-4">
        <div className="mb-6">
          <h1 className="text-lg font-bold">Open Spend</h1>
          <p className="text-xs text-slate-500">Local-first AMEX analytics</p>
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
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                  )
                }
              >
                <Icon className="h-4 w-4" />
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
