import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import type { FeedState, FeedStore } from './feedStore';

const FeedContext = createContext<FeedStore | null>(null);

interface Props {
  store: FeedStore;
  /** FR-A1: load the cache and fetch on open. Off in tests that drive the store themselves. */
  refreshOnMount?: boolean;
  children: ReactNode;
}

export function FeedProvider({ store, refreshOnMount = true, children }: Props) {
  useEffect(() => {
    if (!refreshOnMount) return;
    store.load();
    void store.refresh();
  }, [store, refreshOnMount]);
  return <FeedContext.Provider value={store}>{children}</FeedContext.Provider>;
}

export function useFeedStore(): FeedStore {
  const store = useContext(FeedContext);
  if (!store) throw new Error('useFeedStore must be used inside <FeedProvider>');
  return store;
}

/** The current feed state; re-renders on every change. */
export function useFeed(): FeedState {
  const store = useFeedStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}
