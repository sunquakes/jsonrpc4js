import Request from '../type/request'
import { newResult, newError } from '../type/response'
import {
  INTERNAL_ERROR,
  INVALID_PARAMS,
  INVALID_REQUEST,
  METHOD_NOT_FOUND
} from '../type/error'
import { getMethodParameters } from '../utils/class'

let serviceMethodParameters: Map<string, Array<string>> = new Map()

function parameterObject2Array(
  serviceName: string,
  methodName: string,
  params: { [key: string]: any },
  method: Function
) {
  const key = `${serviceName}/${methodName}`
  let names: Array<string>
  if (serviceMethodParameters.has(key)) {
    names = serviceMethodParameters.get(key) || []
  } else {
    names = getMethodParameters(method)
    serviceMethodParameters.set(key, names)
  }
  return names.map((name) => params[name])
}

/**
 * The outcome of validating a request against the registered services:
 * either a ready-to-send JSON-RPC error message or a thunk that invokes
 * the resolved method (the invocation itself is left to the caller so
 * async/streaming transports can handle the result before serializing).
 */
export type Resolved = { error: string } | { invoke: () => any }

/**
 * Validate the request and map its params, without invoking the method.
 */
export function resolve(message: Request, map: Map<string, object>): Resolved {
  const id = message.id
  const rawMethod = message.method
  if (typeof rawMethod !== 'string') {
    return { error: JSON.stringify(newError(id, INVALID_REQUEST)) }
  }
  const method = rawMethod.startsWith('/') ? rawMethod.substring(1) : rawMethod
  const methodArray = method.split('/')
  const serviceName = methodArray[0]
  const methodName = methodArray[1]
  const service: object | undefined = map.get(serviceName)
  if (service === undefined) {
    return { error: JSON.stringify(newError(id, METHOD_NOT_FOUND)) }
  }
  const methodFn: Function = (service as any)[methodName]
  // Only allow methods defined by the service itself, never inherited Object members.
  if (typeof methodFn !== 'function' || methodName in Object.prototype) {
    return { error: JSON.stringify(newError(id, METHOD_NOT_FOUND)) }
  }

  let params: Array<any>
  try {
    params =
      message.params == null || Array.isArray(message.params)
        ? message.params || []
        : parameterObject2Array(serviceName, methodName, message.params, methodFn)
  } catch (e) {
    return { error: JSON.stringify(newError(id, INVALID_PARAMS)) }
  }

  return { invoke: () => methodFn.apply(service, params) }
}

/**
 * Whether an invocation result should be delivered as a stream of JSON-RPC
 * messages (Array, generator, async generator or async iterable) instead of
 * a single response. Strings and plain values are never streamable.
 */
export function isStreamable(value: any): boolean {
  return (
    value != null &&
    typeof value !== 'string' &&
    (typeof value[Symbol.asyncIterator] === 'function' ||
      typeof value[Symbol.iterator] === 'function')
  )
}

export default function handler(message: Request, map: Map<string, object>): string {
  const resolved = resolve(message, map)
  if ('error' in resolved) {
    return resolved.error
  }
  try {
    const res = resolved.invoke()
    // JSON.stringify drops `undefined` results, which makes them indistinguishable
    // from a missing response. Normalize them to null as JSON-RPC allows.
    return JSON.stringify(newResult(message.id, res === undefined ? null : res))
  } catch (e) {
    return JSON.stringify(newError(message.id, INTERNAL_ERROR))
  }
}
