'use client'

import { toast } from '@/components/Toast/use-toast'
import {
  useListWebhooksDeliveries,
  useRedeliverWebhookEvent,
} from '@/hooks/queries'
import {
  DataTablePaginationState,
  DataTableSortingState,
  getAPIParams,
  serializeSearchParams,
} from '@/utils/datatable'
import {
  KeyboardArrowDownOutlined,
  KeyboardArrowRightOutlined,
} from '@mui/icons-material'
import {
  Organization,
  ResponseError,
  WebhookDelivery,
  WebhookEndpoint,
} from '@polar-sh/sdk'
import { CellContext } from '@tanstack/react-table'
import { useRouter } from 'next/navigation'
import Button from 'polarkit/components/ui/atoms/button'
import {
  DataTable,
  DataTableColumnDef,
  DataTableColumnHeader,
} from 'polarkit/components/ui/atoms/datatable'
import React, { useCallback } from 'react'
import { twMerge } from 'tailwind-merge'

interface DeliveriesTableProps {
  organization: Organization
  endpoint: WebhookEndpoint
  pagination: DataTablePaginationState
  sorting: DataTableSortingState
}

type DeliveryRow = WebhookDelivery & {
  isSubRow?: boolean
}

const DeliveriesTable: React.FC<DeliveriesTableProps> = ({
  organization,
  endpoint,
  pagination,
  sorting,
}) => {
  const getSearchParams = (
    pagination: DataTablePaginationState,
    sorting: DataTableSortingState,
  ) => {
    const params = serializeSearchParams(pagination, sorting)
    return params
  }

  const router = useRouter()

  const setPagination = (
    updaterOrValue:
      | DataTablePaginationState
      | ((old: DataTablePaginationState) => DataTablePaginationState),
  ) => {
    const updatedPagination =
      typeof updaterOrValue === 'function'
        ? updaterOrValue(pagination)
        : updaterOrValue

    router.push(
      `/dashboard/${organization.slug}/settings/webhooks/endpoints/${endpoint.id}?${getSearchParams(
        updatedPagination,
        sorting,
      )}`,
    )
  }

  const setSorting = (
    updaterOrValue:
      | DataTableSortingState
      | ((old: DataTableSortingState) => DataTableSortingState),
  ) => {
    const updatedSorting =
      typeof updaterOrValue === 'function'
        ? updaterOrValue(sorting)
        : updaterOrValue

    router.push(
      `/dashboard/${organization.slug}/settings/webhooks/endpoints/${endpoint.id}?${getSearchParams(
        pagination,
        updatedSorting,
      )}`,
    )
  }

  const deliveriesHook = useListWebhooksDeliveries({
    webhookEndpointId: endpoint.id,
    ...getAPIParams(pagination, sorting),
  })

  const deliveries: DeliveryRow[] = deliveriesHook.data?.items || []
  const pageCount = deliveriesHook.data?.pagination.max_page ?? 1

  const columns: DataTableColumnDef<DeliveryRow>[] = [
    {
      id: 'expand',
      enableSorting: false,
      size: 50,
      cell: ({ row }) => {
        if (!row.getCanExpand()) return null

        return (
          <button
            {...{
              onClick: row.getToggleExpandedHandler(),
              style: { cursor: 'pointer' },
            }}
          >
            {row.getIsExpanded() ? (
              <KeyboardArrowDownOutlined />
            ) : (
              <KeyboardArrowRightOutlined />
            )}
          </button>
        )
      },
    },
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="ID" />
      ),

      cell: (props) => {
        const { row } = props

        const { original: delivery } = row

        if (delivery.isSubRow) {
          return <ExpandedRow {...props} />
        }

        return <span className="text-xs">{delivery.id}</span>
      },
    },
    {
      id: 'http_code',
      enableSorting: false,
      size: 50,

      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),

      cell: (props) => {
        const { row } = props
        const { original: delivery } = row

        if (delivery.isSubRow) {
          return null
        }

        const success =
          delivery.http_code &&
          delivery.http_code >= 200 &&
          delivery.http_code <= 299

        if (delivery.http_code) {
          return (
            <span
              className={twMerge(success ? 'text-green-500' : 'text-red-500')}
            >
              {delivery.http_code}
            </span>
          )
        }

        return <span>Failed</span>
      },
    },
    {
      accessorKey: 'webhook_event',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Data" />
      ),

      cell: (props) => {
        const { row } = props
        const { original: delivery } = row
        const payload = JSON.parse(delivery.webhook_event.payload)

        if (delivery.isSubRow) {
          return null
        }

        return <pre>{payload['type']}</pre>
      },
    },
  ]

  return (
    <>
      {deliveries && pageCount !== undefined ? (
        <DataTable
          columns={columns}
          data={deliveries}
          pageCount={pageCount}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          getRowId={(row) => row.id}
          getCellColSpan={(cell) => {
            if (cell.row.original.isSubRow) {
              if (cell.column.id === 'id') {
                return 4
              }
              // hide cell
              return 0
            }
            return 1
          }}
          getSubRows={(row) => {
            if (row.isSubRow) {
              return undefined
            }
            return [{ ...row, isSubRow: true }]
          }}
          isLoading={deliveriesHook}
        />
      ) : null}
    </>
  )
}

export default DeliveriesTable

const ExpandedRow = (props: CellContext<DeliveryRow, unknown>) => {
  const { row } = props

  const { original: delivery } = row
  const payload = JSON.parse(delivery.webhook_event.payload)

  const redeliver = useRedeliverWebhookEvent()

  const handleRedeliver = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()

      try {
        await redeliver.mutateAsync({ id: delivery.webhook_event.id })

        toast({
          title: 'Attempting Webhook Event Redelivery',
          description: `A new attempt to deliver the webhook event has been made`,
        })
      } catch (e) {
        if (e instanceof ResponseError) {
          toast({
            title: 'Webhook Event Redelivery Failed',
            description: `Error redelivering Webhook Event: ${e.message}`,
          })
        }
      }
    },
    [redeliver, delivery.webhook_event.id],
  )

  return (
    <div className="flex flex-col gap-y-4">
      <div className="grid w-fit grid-cols-2 gap-2 text-sm">
        <div>Event ID</div>
        <code className="text-xs">{delivery.webhook_event.id}</code>

        <div>Delivery ID</div>
        <code className="text-xs">{delivery.id}</code>

        <div>Sent at</div>
        <code className="text-xs">{delivery.created_at}</code>
      </div>
      <div>
        <Button
          variant={'default'}
          onClick={handleRedeliver}
          loading={redeliver.isPending}
        >
          Redeliver
        </Button>
      </div>
      <hr />
      <pre className="whitespace-pre-wrap text-xs">
        {JSON.stringify(payload, undefined, 2)}
      </pre>
    </div>
  )
}
