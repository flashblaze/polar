import webbrowser

from sqlalchemy import Select, select
from sqlalchemy.orm import aliased, contains_eager
from textual import work
from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import DataTable, Footer

from polar.config import settings
from polar.integrations.github.service.repository import (
    github_repository as github_repository_service,
)
from polar.issue.service import issue as issue_service
from polar.models import ExternalOrganization, Organization, Repository
from polar.worker import enqueue_job, flush_enqueued_jobs

from ...db import sessionmaker
from ...widgets.header import PolarHeader
from ...widgets.search_bar import SearchBar


class RepositoriesListScreen(Screen[None]):
    BINDINGS = [
        ("ctrl+r", "refresh", "Refresh"),
        ("ctrl+f", "find", "Find"),
        ("ctrl+g", "open_in_github", "Open in GitHub"),
        ("ctrl+p", "open_in_polar", "Open in Polar"),
        ("ctrl+b", "rebadge_issues", "Rebadge issues"),
        ("ctrl+s", "resync_issues", "Resync issues"),
    ]

    repositories: dict[str, Repository] = {}
    search_query: str | None = None

    def compose(self) -> ComposeResult:
        yield PolarHeader()
        yield DataTable(cursor_type="row")
        yield Footer()
        yield SearchBar()

    def on_mount(self) -> None:
        self._set_sub_title()

        table = self.query_one(DataTable)
        table.add_columns(
            "Name",
            "External Organization",
            "Polar Organization",
            "Platform",
            "Badge label",
        )
        self.get_repositories()

    def action_refresh(self) -> None:
        self.get_repositories()

    def action_find(self) -> None:
        search_bar = self.query_one(SearchBar)
        search_bar.toggle()

    def action_open_in_github(self) -> None:
        table = self.query_one(DataTable)
        cell_key = table.coordinate_to_cell_key(table.cursor_coordinate)
        row_key = cell_key.row_key.value
        if row_key is None:
            return

        repository = self.repositories[row_key]
        organization = repository.organization
        webbrowser.open_new_tab(
            f"https://github.com/{organization.name}/{repository.name}"
        )

    def action_open_in_polar(self) -> None:
        table = self.query_one(DataTable)
        cell_key = table.coordinate_to_cell_key(table.cursor_coordinate)
        row_key = cell_key.row_key.value
        if row_key is None:
            return

        repository = self.repositories[row_key]
        external_organization = repository.organization
        organization = external_organization.safe_organization
        webbrowser.open_new_tab(
            f"{settings.FRONTEND_BASE_URL}/{organization.slug}/{repository.name}"
        )

    def action_rebadge_issues(self) -> None:
        table = self.query_one(DataTable)
        cell_key = table.coordinate_to_cell_key(table.cursor_coordinate)
        row_key = cell_key.row_key.value
        if row_key is None:
            return

        repository = self.repositories[row_key]
        self.rebadge_issues(repository)

        self.app.notify(
            "The repository issues will be marked to be rebadged.",
            title=f"Rebadging {repository.name} issues...",
            timeout=5,
        )

    def action_resync_issues(self) -> None:
        table = self.query_one(DataTable)
        cell_key = table.coordinate_to_cell_key(table.cursor_coordinate)
        row_key = cell_key.row_key.value
        if row_key is None:
            return

        repository = self.repositories[row_key]
        self.resync_issues(repository)

        self.app.notify(
            "The repository issues will be resynced.",
            title=f"Resyncing {repository.name} issues...",
            timeout=5,
        )

    def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        row_key = event.row_key.value
        if row_key is None:
            return

        repository = self.repositories[row_key]

    def on_search_bar_submitted(self, event: SearchBar.Submitted) -> None:
        self.search_query = event.query
        self.get_repositories()

    def on_search_bar_cleared(self, event: SearchBar.Cleared) -> None:
        self.search_query = None
        self.get_repositories()

    @work(exclusive=True)
    async def get_repositories(self) -> None:
        table = self.query_one(DataTable)
        table.loading = True
        table.clear()
        async with sessionmaker() as session:
            statement = self._get_statement()
            stream = await session.stream_scalars(statement)
            async for repository in stream.unique():
                external_organization = repository.organization
                organization = external_organization.safe_organization
                table.add_row(
                    repository.name,
                    external_organization.name,
                    organization.slug,
                    repository.platform,
                    repository.pledge_badge_label,
                    key=str(repository.id),
                )
                self.repositories[str(repository.id)] = repository
            table.loading = False
            table.focus()

    @work(exclusive=True)
    async def rebadge_issues(self, repository: Repository) -> None:
        async with sessionmaker() as session:
            (issues, _) = await issue_service.list_by_repository_type_and_status(
                session, repository_ids=[repository.id], have_polar_badge=True
            )

            queued = []

            for issue in issues:
                if not issue.pledge_badge_currently_embedded:
                    continue

                enqueue_job("github.badge.update_on_issue", issue_id=issue.id)

                queued.append(issue.id)

            self.app.notify(
                f"{len(queued)} issues were queued to be rebadged.",
                title="Repository issues rebadged",
                timeout=5,
            )
        await flush_enqueued_jobs(self.app.arq_pool)  # type: ignore

    @work(exclusive=True)
    async def resync_issues(self, repository: Repository) -> None:
        await github_repository_service.enqueue_sync(repository)
        self.app.notify(
            "Repositority sync enqueued.",
            title=f"{repository.name} have been queued to be resynced",
            timeout=5,
        )
        await flush_enqueued_jobs(self.app.arq_pool)  # type: ignore

    def _set_sub_title(self) -> None:
        self.sub_title = "Repositories"

    def _get_statement(self) -> Select[tuple[Repository]]:
        OrganizationJoin = aliased(Organization)
        statement = (
            (select(Repository))
            .join(Repository.organization)
            .join(
                OrganizationJoin,
                ExternalOrganization.organization_id == OrganizationJoin.id,
            )
            .where(
                Repository.is_fork.is_(False),
                Repository.is_archived.is_(False),
                Repository.is_disabled.is_(False),
                ExternalOrganization.organization_id.isnot(None),
            )
            .order_by(ExternalOrganization.name, Repository.name)
            .options(
                contains_eager(Repository.organization).contains_eager(
                    ExternalOrganization.organization.of_type(OrganizationJoin)
                )
            )
        )

        if self.search_query:
            clauses = self.search_query.split()
            fuzzy_clauses = []
            for clause in clauses:
                if clause.startswith("org:"):
                    statement = statement.where(
                        OrganizationJoin.slug.ilike(f"%{clause[len('org:') :]}%")
                    )
                else:
                    fuzzy_clauses.append(clause)
            if len(fuzzy_clauses):
                statement = statement.where(
                    Repository.name.ilike(f"%{' '.join(fuzzy_clauses)}%")
                )

        return statement


class OrganizationRepositoriesListScreen(RepositoriesListScreen):
    BINDINGS = [
        ("escape", "pop_screen", "Back"),
    ]

    organization: Organization

    def __init__(
        self,
        organization: Organization,
        name: str | None = None,
        id: str | None = None,
        classes: str | None = None,
    ) -> None:
        self.organization = organization
        super().__init__(name, id, classes)

    def _set_sub_title(self) -> None:
        self.sub_title = f"Repositories of {self.organization.slug}"

    def _get_statement(self) -> Select[tuple[Repository]]:
        return (
            super()
            ._get_statement()
            .where(Repository.organization_id == self.organization.id)
        )
