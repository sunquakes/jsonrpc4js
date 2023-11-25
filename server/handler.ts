import Request from '../type/request'

export default function handler(message: Request, map: Map<string, object>): string {
  const methodArray = message.method.split('/')
  const serviceName = methodArray[0]
  const methodName = methodArray[1]
  const service: object | undefined = map.get(serviceName)
  if (service !== undefined) {
    const method: Function = (service as any)[methodName]
    if (method !== undefined) {
      const res = method(...message.params)
      return JSON.stringify(res)
    }
  }
  return JSON.stringify(message)
}
