import type { PvaApi } from './types'

export type * from './types'

declare global {
  interface Window {
    api: PvaApi
  }
}
