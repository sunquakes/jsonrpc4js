import Request from '../type/request'
import { newResult, newError } from '../type/response'
import { METHOD_NOT_FOUND, INVALID_PARAMS } from '../type/error'
import { getMethodParameters } from '../utils/class'

let serviceMethodParameters: Map<string, Array<string>> = new Map()

function parameterObject2Array(
  serviceName: string,
  methodName: string,
  params: { [key: string]: any },
  method: Function
) {
  const key = `${serviceName}-${methodName}`
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
  const methodArray = message.method.split('/')
  const serviceName = methodArray[0]
  const methodName = methodArray[1]
  const service: object | undefined = map.get(serviceName)
  if (service !== undefined) {
    const method: Function = (service as any)[methodName]
    if (method !== undefined) {
      try {
        let params = message.params
        if (!Array.isArray(params)) {
          params = parameterObject2Array(serviceName, methodName, params, method)
        }
        const res = method(...params)
        return JSON.stringify(newResult(message.id, res))
      } catch (e) {
        return JSON.stringify(newError(message.id, INVALID_PARAMS))
      }
    }
  } else {
    return JSON.stringify(newError(message.id, METHOD_NOT_FOUND))
  }
  return JSON.stringify(newError(message.id, METHOD_NOT_FOUND))
}
