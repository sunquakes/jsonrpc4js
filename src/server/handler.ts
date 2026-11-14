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

export default function handler(message: Request, map: Map<string, object>): string {
  const id = message.id
  const rawMethod = message.method
  if (typeof rawMethod !== 'string') {
    return JSON.stringify(newError(id, INVALID_REQUEST))
  }
  const method = rawMethod.startsWith('/') ? rawMethod.substring(1) : rawMethod
  const methodArray = method.split('/')
  const serviceName = methodArray[0]
  const methodName = methodArray[1]
  const service: object | undefined = map.get(serviceName)
  if (service === undefined) {
    return JSON.stringify(newError(id, METHOD_NOT_FOUND))
  }
  const methodFn: Function = (service as any)[methodName]
  // Only allow methods defined by the service itself, never inherited Object members.
  if (typeof methodFn !== 'function' || methodName in Object.prototype) {
    return JSON.stringify(newError(id, METHOD_NOT_FOUND))
  }

  let params: Array<any>
  try {
    params =
      message.params == null || Array.isArray(message.params)
        ? message.params || []
        : parameterObject2Array(serviceName, methodName, message.params, methodFn)
  } catch (e) {
    return JSON.stringify(newError(id, INVALID_PARAMS))
  }

  try {
    const res = methodFn.apply(service, params)
    // JSON.stringify drops `undefined` results, which makes them indistinguishable
    // from a missing response. Normalize them to null as JSON-RPC allows.
    return JSON.stringify(newResult(id, res === undefined ? null : res))
  } catch (e) {
    return JSON.stringify(newError(id, INTERNAL_ERROR))
  }
}
