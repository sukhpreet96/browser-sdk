import { clearInterval, setInterval } from '../../tools/timer'
import { Observable } from '../../tools/observable'
import { ONE_SECOND, dateNow } from '../../tools/utils/timeUtils'
import { throttle } from '../../tools/utils/functionUtils'
import { generateUUID } from '../../tools/utils/stringUtils'
import { SESSION_TIME_OUT_DELAY } from './sessionConstants'
import { checkCookieAvailability, initCookieStrategy } from './storeStrategies/sessionInCookie'
import type { SessionStoreOptions, SessionStoreStrategyType } from './storeStrategies/sessionStoreStrategy'
import type { SessionState } from './sessionState'
import { checkLocalStorageAvailability, initLocalStorageStrategy } from './storeStrategies/sessionInLocalStorage'
import { processSessionStoreOperations } from './sessionStoreOperations'

export interface SessionStore {
  expandOrRenewSession: () => void
  expandSession: () => void
  getSession: () => SessionState
  renewObservable: Observable<void>
  expireObservable: Observable<void>
  expire: () => void
  stop: () => void
}

const POLL_DELAY = ONE_SECOND

/**
 * Checks if cookies are available as the preferred storage
 * Else, checks if LocalStorage is allowed and available
 */
export function getSessionStoreStrategyType(
  sessionStoreOptions: SessionStoreOptions
): SessionStoreStrategyType | undefined {
  let sessionStoreStrategyType: SessionStoreStrategyType | undefined

  if (checkCookieAvailability(sessionStoreOptions.cookie)) {
    sessionStoreStrategyType = 'COOKIE'
  } else if (sessionStoreOptions.allowFallbackToLocalStorage && checkLocalStorageAvailability()) {
    sessionStoreStrategyType = 'LOCAL_STORAGE'
  }

  return sessionStoreStrategyType
}

/**
 * Different session concepts:
 * - tracked, the session has an id and is updated along the user navigation
 * - not tracked, the session does not have an id but it is updated along the user navigation
 * - inactive, no session in store or session expired, waiting for a renew session
 */
export function startSessionStore<TrackingType extends string>(
  sessionStoreStrategyType: SessionStoreStrategyType,
  sessionStoreOptions: SessionStoreOptions,
  productKey: string,
  computeSessionState: (rawTrackingType?: string) => { trackingType: TrackingType; isTracked: boolean }
): SessionStore {
  const renewObservable = new Observable<void>()
  const expireObservable = new Observable<void>()

  const sessionStoreStrategy =
    sessionStoreStrategyType === 'COOKIE' ? initCookieStrategy(sessionStoreOptions.cookie) : initLocalStorageStrategy()
  const { clearSession, retrieveSession } = sessionStoreStrategy

  const watchSessionTimeoutId = setInterval(watchSession, POLL_DELAY)
  let sessionCache: SessionState = retrieveActiveSession()

  function expandOrRenewSession() {
    let isTracked: boolean
    processSessionStoreOperations(
      {
        process: (sessionState) => {
          const synchronizedSession = synchronizeSession(sessionState)
          isTracked = expandOrRenewSessionState(synchronizedSession)
          return synchronizedSession
        },
        after: (sessionState) => {
          if (isTracked && !hasSessionInCache()) {
            renewSessionInCache(sessionState)
          }
          sessionCache = sessionState
        },
      },
      sessionStoreStrategy
    )
  }

  function expandSession() {
    processSessionStoreOperations(
      {
        process: (sessionState) => (hasSessionInCache() ? synchronizeSession(sessionState) : undefined),
      },
      sessionStoreStrategy
    )
  }

  /**
   * allows two behaviors:
   * - if the session is active, synchronize the session cache without updating the session store
   * - if the session is not active, clear the session store and expire the session cache
   */
  function watchSession() {
    processSessionStoreOperations(
      {
        process: (sessionState) => (!isActiveSession(sessionState) ? {} : undefined),
        after: synchronizeSession,
      },
      sessionStoreStrategy
    )
  }

  function synchronizeSession(sessionState: SessionState) {
    if (!isActiveSession(sessionState)) {
      sessionState = {}
    }
    if (hasSessionInCache()) {
      if (isSessionInCacheOutdated(sessionState)) {
        expireSessionInCache()
      } else {
        sessionCache = sessionState
      }
    }
    return sessionState
  }

  function expandOrRenewSessionState(sessionState: SessionState) {
    const { trackingType, isTracked } = computeSessionState(sessionState[productKey])
    sessionState[productKey] = trackingType
    if (isTracked && !sessionState.id) {
      sessionState.id = generateUUID()
      sessionState.created = String(dateNow())
    }
    return isTracked
  }

  function hasSessionInCache() {
    return sessionCache[productKey] !== undefined
  }

  function isSessionInCacheOutdated(sessionState: SessionState) {
    return sessionCache.id !== sessionState.id || sessionCache[productKey] !== sessionState[productKey]
  }

  function expireSessionInCache() {
    sessionCache = {}
    expireObservable.notify()
  }

  function renewSessionInCache(sessionState: SessionState) {
    sessionCache = sessionState
    renewObservable.notify()
  }

  function retrieveActiveSession(): SessionState {
    const session = retrieveSession()
    if (isActiveSession(session)) {
      return session
    }
    return {}
  }

  function isActiveSession(sessionDate: SessionState) {
    // created and expire can be undefined for versions which was not storing them
    // these checks could be removed when older versions will not be available/live anymore
    return (
      (sessionDate.created === undefined || dateNow() - Number(sessionDate.created) < SESSION_TIME_OUT_DELAY) &&
      (sessionDate.expire === undefined || dateNow() < Number(sessionDate.expire))
    )
  }

  return {
    expandOrRenewSession: throttle(expandOrRenewSession, POLL_DELAY).throttled,
    expandSession,
    getSession: () => sessionCache,
    renewObservable,
    expireObservable,
    expire: () => {
      clearSession()
      synchronizeSession({})
    },
    stop: () => {
      clearInterval(watchSessionTimeoutId)
    },
  }
}
