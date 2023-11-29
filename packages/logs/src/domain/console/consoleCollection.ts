import type { Context, ClocksState, ConsoleLog } from '@datadog/browser-core'
import { timeStampNow, ConsoleApiName, ErrorSource, initConsoleObservable } from '@datadog/browser-core'
import type { LogsConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import { LifeCycleEventType } from '../lifeCycle'
import { StatusType } from '../logger'
import { LogsComponents } from '../../boot/logsComponents'

export interface ProvidedError {
  startClocks: ClocksState
  error: unknown
  context?: Context
  handlingStack: string
}

export const LogStatusForApi = {
  [ConsoleApiName.log]: StatusType.info,
  [ConsoleApiName.debug]: StatusType.debug,
  [ConsoleApiName.info]: StatusType.info,
  [ConsoleApiName.warn]: StatusType.warn,
  [ConsoleApiName.error]: StatusType.error,
}
export function startConsoleCollection(configuration: LogsConfiguration, lifeCycle: LifeCycle) {
  const consoleSubscription = initConsoleObservable(configuration.forwardConsoleLogs).subscribe((log: ConsoleLog) => {
    lifeCycle.notify(LifeCycleEventType.RAW_LOG_COLLECTED, {
      rawLogsEvent: {
        date: timeStampNow(),
        message: log.message,
        origin: ErrorSource.CONSOLE,
        error:
          log.api === ConsoleApiName.error
            ? {
                stack: log.stack,
                fingerprint: log.fingerprint,
              }
            : undefined,
        status: LogStatusForApi[log.api],
      },
    })
  })

  return {
    stop: () => {
      consoleSubscription.unsubscribe()
    },
  }
}
/* eslint-disable local-rules/disallow-side-effects */
startConsoleCollection.$id = LogsComponents.ConsoleCollection
startConsoleCollection.$deps = [LogsComponents.Configuration, LogsComponents.LifeCycle]
/* eslint-enable local-rules/disallow-side-effects */
