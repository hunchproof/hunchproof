import { useMutation, useQuery, type UseMutationResult } from '@tanstack/react-query'
import { IS_LIVE } from '../config'
import { api, ApiError, type CommitBody, type RevealBody } from './client'
import { liveBoards, liveOracle, livePortfolio, liveSlate } from './derive'
import { demoBoards, demoOracle, demoPortfolio, demoSlate } from '../demo/crowd'
import { useVault } from '../hooks/useCommitVault'
import type { ApiPredictionRow, ApiRevealResponse, Slate } from './types'
import type { BoardsVM, OracleVM, PortfolioVM } from '../models'

const STALE = 15_000

/* All hooks are called unconditionally; the branch is on IS_LIVE, a module constant,
   so hook order never changes between renders (Rules of Hooks hold). */

export function useSlate(): {
  slate: Slate | undefined
  isLoading: boolean
  error: ApiError | null
  refetch: () => void
} {
  const q = useQuery({
    queryKey: ['slate'],
    queryFn: async () => liveSlate(await api.getOpenSlate()),
    enabled: IS_LIVE,
    refetchInterval: IS_LIVE ? 60_000 : false,
    staleTime: STALE,
  })
  if (!IS_LIVE) {
    return { slate: demoSlate(), isLoading: false, error: null, refetch: () => q.refetch() }
  }
  return {
    slate: q.data,
    isLoading: q.isLoading,
    error: (q.error as ApiError) ?? null,
    refetch: () => q.refetch(),
  }
}

export function usePredictions(userId: string) {
  return useQuery({
    queryKey: ['predictions', userId],
    queryFn: () => api.listPredictions({ user_id: userId }),
    enabled: IS_LIVE && !!userId,
    staleTime: STALE,
  })
}

export function useAllPredictions() {
  return useQuery({
    queryKey: ['predictions', 'all'],
    queryFn: () => api.listPredictions(),
    enabled: IS_LIVE,
    staleTime: STALE,
  })
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.getLeaderboard(),
    enabled: IS_LIVE,
    staleTime: STALE,
  })
}

export function usePortfolioModel(userId: string): {
  model: PortfolioVM
  isLoading: boolean
  error: ApiError | null
} {
  const preds = usePredictions(userId)
  const vaultEntries = useVault(userId)
  if (!IS_LIVE) return { model: demoPortfolio(), isLoading: false, error: null }
  const rows: ApiPredictionRow[] = preds.data?.predictions ?? []
  return {
    model: livePortfolio(rows, vaultEntries),
    isLoading: preds.isLoading,
    error: (preds.error as ApiError) ?? null,
  }
}

export function useBoardsModel(meId: string): {
  model: BoardsVM
  isLoading: boolean
  error: ApiError | null
} {
  const all = useAllPredictions()
  const lb = useLeaderboard()
  if (!IS_LIVE) return { model: demoBoards(), isLoading: false, error: null }
  return {
    model: liveBoards(all.data?.predictions ?? [], lb.data, meId),
    isLoading: all.isLoading || lb.isLoading,
    error: ((all.error || lb.error) as ApiError) ?? null,
  }
}

export function useOracleModel(): { model: OracleVM; isLoading: boolean; error: ApiError | null } {
  const all = useAllPredictions()
  if (!IS_LIVE) return { model: demoOracle(), isLoading: false, error: null }
  return {
    model: liveOracle(all.data?.predictions ?? []),
    isLoading: all.isLoading,
    error: (all.error as ApiError) ?? null,
  }
}

export function useCommitMutation(): UseMutationResult<unknown, ApiError, CommitBody> {
  return useMutation({ mutationFn: (b: CommitBody) => api.commit(b) })
}

export function useRevealMutation(): UseMutationResult<ApiRevealResponse, ApiError, RevealBody> {
  return useMutation({ mutationFn: (b: RevealBody) => api.reveal(b) })
}
