import { schemas } from '@polar-sh/client'
import {
  formatCurrencyAndAmount,
  getCentsInDollarString,
} from '@polar-sh/ui/lib/money'
import IssuePledge from './IssuePledge'
import IssueRewards from './IssueRewards'

const IssueListItemDecoration = ({
  pledges,
  pledgesSummary,
  showDisputeAction,
  onDispute,
  onConfirmPledges,
  showConfirmPledgeAction,
  confirmPledgeIsLoading,
  funding,
  issue,
  organization,
  rewards,
}: {
  pledges: Array<schemas['Pledge']>
  pledgesSummary: schemas['PledgesTypeSummaries'] | null
  showDisputeAction: boolean
  onDispute: (pledge: schemas['Pledge']) => void
  onConfirmPledges: () => void
  showConfirmPledgeAction: boolean
  confirmPledgeIsLoading: boolean
  funding: schemas['Funding']
  issue: schemas['Issue']
  organization: schemas['Organization']
  rewards: schemas['Reward'][] | null
}) => {
  const showPledges = pledges && pledges.length > 0

  const ONE_DAY = 1000 * 60 * 60 * 24
  const now = new Date()

  const remainingDays = (pledge: schemas['Pledge']) => {
    if (!pledge.scheduled_payout_at) {
      return -1
    }

    return Math.floor(
      (new Date(pledge.scheduled_payout_at).getTime() - now.getTime()) /
        ONE_DAY,
    )
  }

  const disputablePledges =
    pledges
      ?.filter(
        (p) =>
          p.authed_can_admin_sender &&
          p.scheduled_payout_at &&
          p.state === 'pending' &&
          remainingDays(p) >= 0,
      )
      .map((p) => {
        return {
          ...p,
          remaining_days: remainingDays(p),
        }
      }) || []

  const disputedPledges = pledges?.filter((p) => p.state === 'disputed') || []

  const canDisputeAny =
    pledges &&
    pledges.find(
      (p) =>
        p.authed_can_admin_sender &&
        p.scheduled_payout_at &&
        p.state === 'pending' &&
        remainingDays(p) >= 0,
    )

  const pledgeStatusShowCount =
    disputablePledges.length + disputedPledges.length

  const showPledgeStatusBox = pledgeStatusShowCount > 0
  const disputeBoxShowAmount = pledgeStatusShowCount > 1

  const onClickDisputeButton = (pledge: schemas['Pledge']) => {
    if (!canDisputeAny || !onDispute) {
      return
    }
    onDispute(pledge)
  }

  const pledgeAmount = (pledge: schemas['Pledge']): number => {
    if (typeof pledge.amount === 'number') {
      return pledge.amount
    }
    return pledge.amount
  }

  const pledgesSummaryOrDefault = pledgesSummary ?? {
    pay_directly: { total: { currency: 'usd', amount: 0 }, pledgers: [] },
    pay_on_completion: { total: { currency: 'usd', amount: 0 }, pledgers: [] },
    pay_upfront: { total: { currency: 'usd', amount: 0 }, pledgers: [] },
  }

  return (
    <div>
      <div className="dark:divide-polar-700 flex flex-col divide-y divide-gray-100">
        {showPledges && (
          <IssuePledge
            issue={issue}
            organization={organization}
            pledges={pledges}
            pledgesSummary={pledgesSummaryOrDefault}
            onConfirmPledges={onConfirmPledges}
            showConfirmPledgeAction={showConfirmPledgeAction}
            confirmPledgeIsLoading={confirmPledgeIsLoading}
            funding={funding}
          />
        )}
        {rewards && rewards?.length > 0 && <IssueRewards rewards={rewards} />}
      </div>

      {showDisputeAction && showPledgeStatusBox && (
        <div className="dark:bg-polar-900 dark:border-polar-700 border-t border-gray-200 bg-gray-50 px-6 pb-1.5 pt-1">
          {disputablePledges.map((p) => {
            return (
              <div key={p.id}>
                <span className="text-sm text-gray-500">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      onClickDisputeButton(p)
                    }}
                    className="text-blue-500 dark:text-blue-400"
                  >
                    Dispute
                  </a>{' '}
                  {p.remaining_days > 0 && (
                    <>
                      within {p.remaining_days}{' '}
                      {p.remaining_days === 1 ? 'day' : 'days'}
                    </>
                  )}
                  {p.remaining_days == 0 && <>today</>}{' '}
                  {disputeBoxShowAmount && (
                    <>(${getCentsInDollarString(pledgeAmount(p))})</>
                  )}
                </span>
              </div>
            )
          })}

          {disputedPledges.map((p) => {
            return (
              <div key={p.id}>
                {p.authed_can_admin_sender && (
                  <span className="text-sm text-gray-500">
                    You&apos;ve disputed your pledge{' '}
                    {disputeBoxShowAmount && (
                      <>({formatCurrencyAndAmount(p.amount, p.currency)})</>
                    )}
                  </span>
                )}

                {p.authed_can_admin_received && (
                  <span className="text-sm text-gray-500">
                    {p.pledger?.name} disputed their pledge{' '}
                    {disputeBoxShowAmount && (
                      <>({formatCurrencyAndAmount(p.amount, p.currency)})</>
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default IssueListItemDecoration
