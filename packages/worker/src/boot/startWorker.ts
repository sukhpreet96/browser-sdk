/* eslint-disable local-rules/disallow-zone-js-patched-values */
import { Deflate, constants, string2buf } from '../domain/deflate'
import type { DeflateWorkerAction } from '../types'

export function startWorker() {
  monitor(() => {
    let deflate = new Deflate()
    self.addEventListener(
      'message',
      monitor((event: MessageEvent<DeflateWorkerAction>) => {
        const data = event.data
        switch (data.action) {
          case 'init':
            self.postMessage({
              type: 'initialized',
            })
            break

          case 'write': {
            const previousChunksLength = deflate.chunks.length
            const additionalBytesCount = pushData(data.data)
            self.postMessage({
              type: 'wrote',
              id: data.id,
              result: concatBuffers(deflate.chunks.slice(previousChunksLength)),
              trailer: makeTrailer(deflate),
              additionalBytesCount,
            })
            break
          }

          case 'reset':
            deflate = new Deflate()
            break
        }
      })
    )

    function pushData(data: string) {
      // TextEncoder is not supported on old browser version like Edge 18, therefore we use string2buf
      const binaryData = string2buf(data)
      deflate.push(binaryData, constants.Z_SYNC_FLUSH)
      return binaryData.length
    }
  })()
}

function monitor<Args extends any[], Result>(fn: (...args: Args) => Result): (...args: Args) => Result | undefined {
  return (...args) => {
    try {
      return fn(...args)
    } catch (e) {
      try {
        self.postMessage({
          type: 'errored',
          error: e,
        })
      } catch (_) {
        // DATA_CLONE_ERR, cf https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
        self.postMessage({
          type: 'errored',
          error: String(e),
        })
      }
    }
  }
}

function concatBuffers(buffers: Uint8Array[]) {
  const length = buffers.reduce((total, buffer) => total + buffer.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const buffer of buffers) {
    result.set(buffer, offset)
    offset += buffer.length
  }
  return result
}

function makeTrailer(deflate: Deflate): Uint8Array {
  /* eslint-disable no-bitwise */
  const adler = deflate.strm.adler
  // This is essentially the output of a `deflate.push('', constants.Z_FINISH)` operation.
  return new Uint8Array([
    // Empty deflate block
    3,
    0,
    // Adler32 checksum
    (adler >>> 24) & 0xff,
    (adler >>> 16) & 0xff,
    (adler >>> 8) & 0xff,
    adler & 0xff,
  ])
  /* eslint-enable no-bitwise */
}
