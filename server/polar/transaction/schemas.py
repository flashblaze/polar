from pydantic import UUID4

from polar.enums import Platforms, SubscriptionRecurringInterval
from polar.kit.schemas import IDSchema, Schema, TimestampedSchema
from polar.models.pledge import PledgeState
from polar.models.transaction import PlatformFeeType, Processor, TransactionType


class TransactionExternalOrganization(IDSchema, TimestampedSchema):
    platform: Platforms
    name: str
    avatar_url: str
    is_personal: bool


class TransactionRepository(IDSchema, TimestampedSchema):
    platform: Platforms
    organization_id: UUID4
    name: str


class TransactionUser(IDSchema, Schema):
    public_name: str
    avatar_url: str


class TransactionIssue(IDSchema, TimestampedSchema):
    platform: Platforms
    organization_id: UUID4
    repository_id: UUID4
    number: int
    title: str

    organization: TransactionExternalOrganization
    repository: TransactionRepository


class TransactionPledge(IDSchema, TimestampedSchema):
    state: PledgeState
    issue: TransactionIssue


class TransactionOrganization(IDSchema, TimestampedSchema):
    name: str
    slug: str
    avatar_url: str | None


class TransactionIssueReward(IDSchema, TimestampedSchema):
    issue_id: UUID4
    share_thousands: int


class TransactionProduct(IDSchema, TimestampedSchema):
    name: str
    recurring_interval: SubscriptionRecurringInterval | None
    organization_id: UUID4 | None
    organization: TransactionOrganization | None


class TransactionOrder(IDSchema, TimestampedSchema):
    product: TransactionProduct
    subscription_id: UUID4 | None


class TransactionEmbedded(IDSchema, TimestampedSchema):
    type: TransactionType
    processor: Processor | None

    currency: str
    amount: int
    account_currency: str
    account_amount: int

    platform_fee_type: PlatformFeeType | None

    pledge_id: UUID4 | None
    issue_reward_id: UUID4 | None
    order_id: UUID4 | None

    payout_transaction_id: UUID4 | None
    incurred_by_transaction_id: UUID4 | None


class Transaction(TransactionEmbedded):
    pledge: TransactionPledge | None
    issue_reward: TransactionIssueReward | None
    order: TransactionOrder | None

    account_incurred_transactions: list[TransactionEmbedded]

    incurred_amount: int
    gross_amount: int
    net_amount: int


class TransactionDetails(Transaction):
    paid_transactions: list[Transaction]


class TransactionsBalance(Schema):
    currency: str
    amount: int
    account_currency: str
    account_amount: int


class TransactionsSummary(Schema):
    balance: TransactionsBalance
    payout: TransactionsBalance


class PayoutCreate(Schema):
    account_id: UUID4


class PayoutEstimate(Schema):
    account_id: UUID4
    gross_amount: int
    fees_amount: int
    net_amount: int
