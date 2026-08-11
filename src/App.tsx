import { AppConfigProvider } from './context/AppConfigContext'
import { IntegrationProvider } from './context/IntegrationContext'
import { WorkflowProvider } from './context/WorkflowContext'
import { TopHeader } from './components/layout/TopHeader'
import { PipelineSidebar } from './components/layout/PipelineSidebar'
import { MainWorkspace } from './components/layout/MainWorkspace'
import { IntegrationSettingsModal } from './components/settings/IntegrationSettingsModal'
import { AdminApp } from './admin/AdminApp'
import { useHashRoute } from './admin/routing'

function Workbench() {
  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <TopHeader />
        <div className="flex min-h-0 flex-1">
          <PipelineSidebar />
          <MainWorkspace />
        </div>
      </div>
      <IntegrationSettingsModal />
    </>
  )
}

function Root() {
  const { route, navigate } = useHashRoute()

  if (route.area === 'admin') {
    return (
      <AdminApp
        page={route.page}
        onNavigate={(page) => navigate({ area: 'admin', page })}
        onBackWorkbench={() => navigate({ area: 'workbench' })}
      />
    )
  }

  return (
    <IntegrationProvider>
      <WorkflowProvider>
        <Workbench />
      </WorkflowProvider>
    </IntegrationProvider>
  )
}

export default function App() {
  return (
    <AppConfigProvider>
      <Root />
    </AppConfigProvider>
  )
}
