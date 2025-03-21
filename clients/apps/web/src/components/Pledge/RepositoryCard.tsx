import { githubRepoUrl } from '@/utils/github'
import { formatStarsNumber } from '@/utils/stars'
import { schemas } from '@polar-sh/client'
import Avatar from '@polar-sh/ui/components/atoms/Avatar'
import GrayCard from '../Cards/GrayCard'

const prettyURL = (url: string): string => {
  if (url.indexOf('https://') === 0) {
    url = url.substring(8)
  }
  if (url.indexOf('http://') === 0) {
    url = url.substring(7)
  }
  return url
}

const RepositoryCard = ({
  organization,
  repository,
}: {
  organization: schemas['Organization']
  repository: schemas['Repository']
}) => {
  const repoURL = githubRepoUrl(organization.slug, repository.name)

  return (
    <>
      <GrayCard className="px-8 text-center">
        <div className="flex flex-row items-center justify-center space-x-2">
          <Avatar
            name={organization.name}
            avatar_url={organization.avatar_url}
            className="h-8 w-8"
          />
          <h2 className="text-lg font-normal">{repository.name}</h2>
        </div>
        <p className="my-3 text-sm font-normal text-gray-500">
          {repository.description}
        </p>
        <div className="flex flex-row items-center justify-center space-x-4">
          {typeof repository.stars === 'number' && (
            <p className="dark:text-polar-400 inline-flex items-center space-x-1 text-xs text-gray-600">
              <span className="font-medium">
                {formatStarsNumber(repository.stars)}
              </span>
              <span>stars</span>
            </p>
          )}

          {repository.license && (
            <a
              className="whitespace-pre text-xs text-blue-500 dark:text-blue-400"
              href={repoURL}
            >
              {repository.license}
            </a>
          )}
          {!repository.license && (
            <a
              className="dark:text-polar-400 text-xs text-gray-600"
              href={repoURL}
            >
              Unknown license
            </a>
          )}

          {repository.homepage && (
            <a
              className="text-xs text-blue-500 dark:text-blue-400"
              href={repository.homepage}
            >
              {prettyURL(repository.homepage)}
            </a>
          )}
        </div>
      </GrayCard>
    </>
  )
}
export default RepositoryCard
