import Request from '../type/request'
import { newResult, newError } from '../type/response'

export default function handler(message: Request, map: Map<string, object>): string {
  const methodArray = message.method.split('/')
  const serviceName = methodArray[0]
  const methodName = methodArray[1]
  const service: object | undefined = map.get(serviceName)
  if (service !== undefined) {
    const method: Function = (service as any)[methodName]
    if (method !== undefined) {
      const res = method(...message.params)
      return JSON.stringify(newResult(message.id, res))
    }
  } else {
    return JSON.stringify(newError(message.id, res))
  }
  return JSON.stringify(message)
}
