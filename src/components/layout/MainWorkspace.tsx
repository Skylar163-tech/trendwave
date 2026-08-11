import { useWorkflow } from '../../context/WorkflowContext'
import { ContextBar } from '../shared/ContextBar'
import { NewsFetchStep } from '../steps/NewsFetchStep'
import { SuggestMatchStep } from '../steps/SuggestMatchStep'
import { ConfirmMatchStep } from '../steps/ConfirmMatchStep'
import { CopyCreateStep } from '../steps/CopyCreateStep'
import { ReviewPublishStep } from '../steps/ReviewPublishStep'

export function MainWorkspace() {
  const { step, isStepPending } = useWorkflow()

  return (
    <main className="scrollbar-thin min-w-0 flex-1 overflow-y-auto p-5 md:p-6">
      <div
        className={[
          'mx-auto max-w-5xl transition-opacity duration-200',
          isStepPending ? 'opacity-60' : 'opacity-100',
        ].join(' ')}
      >
        <ContextBar />
        {step === 'news' && <NewsFetchStep />}
        {step === 'suggest' && <SuggestMatchStep />}
        {step === 'match' && <ConfirmMatchStep />}
        {step === 'copy' && <CopyCreateStep />}
        {step === 'review' && <ReviewPublishStep />}
      </div>
    </main>
  )
}
