import type { RawError, HttpRequest, DeflateEncoder } from '@datadog/browser-core'
import { createHttpRequest, addTelemetryDebug, canUseEventBridge } from '@datadog/browser-core'
import type { LifeCycle, ViewContexts, RumConfiguration, RumSessionManager } from '@datadog/browser-rum-core'
import { LifeCycleEventType, SessionReplayState } from '@datadog/browser-rum-core'

import { record } from '../domain/record'
import { startSegmentCollection, SEGMENT_BYTES_LIMIT } from '../domain/segmentCollection'
import type { BrowserRecord } from '../types'
import { startRecordBridge } from '../domain/startRecordBridge'
import { startRecordsCaching } from '../domain/recordsCaching'

export function startRecording(
  lifeCycle: LifeCycle,
  configuration: RumConfiguration,
  sessionManager: RumSessionManager,
  viewContexts: ViewContexts,
  encoder: DeflateEncoder,
  httpRequest?: HttpRequest
) {
  const cleanupTasks: Array<() => void> = []

  const reportError = (error: RawError) => {
    lifeCycle.notify(LifeCycleEventType.RAW_ERROR_COLLECTED, { error })
    addTelemetryDebug('Error reported to customer', { 'error.message': error.message })
  }

  const replayRequest =
    httpRequest ||
    createHttpRequest(configuration, configuration.sessionReplayEndpointBuilder, SEGMENT_BYTES_LIMIT, reportError)

  let addRecord: (record: BrowserRecord) => void
  let getCachedRecords: () => BrowserRecord[]

  const initSegemntCollection = () => {
    const segmentCollection = startSegmentCollection(
      lifeCycle,
      configuration,
      sessionManager,
      viewContexts,
      replayRequest,
      encoder
    )
    cleanupTasks.push(segmentCollection.stop)
    return { addRecord: segmentCollection.addRecord }
  }
  const session = sessionManager.findTrackedSession()!
  if (!canUseEventBridge()) {
    if (session.sessionReplay === SessionReplayState.OFF) {
      ;({ addRecord, getRecords: getCachedRecords } = startRecordsCaching())
    } else {
      ;({ addRecord } = initSegemntCollection())
    }
  } else {
    ;({ addRecord } = startRecordBridge(viewContexts))
  }

  function flushCachedRecords() {
    if (getCachedRecords) {
      const { addRecord: addRecordToSegment } = initSegemntCollection()
      const records = getCachedRecords()
      records.forEach(addRecordToSegment)

      addRecord = addRecordToSegment
    }
  }

  const { stop: stopRecording } = record({
    emit: addRecord,
    configuration,
    lifeCycle,
    viewContexts,
  })
  cleanupTasks.push(stopRecording)

  return {
    flushCachedRecords,
    stop: () => {
      cleanupTasks.forEach((task) => task())
    },
  }
}
