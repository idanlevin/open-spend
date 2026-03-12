import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { CategoriesPage } from '@/features/categories/categories-page'
import { DashboardPage } from '@/features/dashboard/dashboard-page'
import { InsightsPage } from '@/features/insights/insights-page'
import { MerchantsPage } from '@/features/merchants/merchants-page'
import { PaymentsPage } from '@/features/payments/payments-page'
import { ReviewPage } from '@/features/review/review-page'
import { RulesPage } from '@/features/rules/rules-page'
import { SettingsPage } from '@/features/settings/settings-page'
import { StatementsPage } from '@/features/statements/statements-page'
import { TagsPage } from '@/features/tags/tags-page'
import { TransactionsPage } from '@/features/transactions/transactions-page'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'transactions',
        element: <TransactionsPage />,
      },
      {
        path: 'payments',
        element: <PaymentsPage />,
      },
      {
        path: 'insights',
        element: <InsightsPage />,
      },
      {
        path: 'statements',
        element: <StatementsPage />,
      },
      {
        path: 'merchants',
        element: <MerchantsPage />,
      },
      {
        path: 'categories',
        element: <CategoriesPage />,
      },
      {
        path: 'tags',
        element: <TagsPage />,
      },
      {
        path: 'rules',
        element: <RulesPage />,
      },
      {
        path: 'review',
        element: <ReviewPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
])
