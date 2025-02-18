import useSWR from 'swr'
import useSWRMutation from 'swr/mutation'

const fetcher = (...args: [RequestInfo, RequestInit?]) => fetch(...args).then((res) => res.json())

export const useFetchSWR = (key: string) => {
  const { data, error, isLoading, mutate } = useSWR(key, fetcher)
  return { data, error, isLoading, mutate }
}

type Fetcher = (url: string, { arg }: { arg: RequestInit }) => Promise<any>
export const useFetchSWRMutation = (key: string, fetcher: Fetcher) => {
  const { data, error, trigger, isMutating } = useSWRMutation(key, fetcher)

  return { data, error, trigger, isMutating }
}
