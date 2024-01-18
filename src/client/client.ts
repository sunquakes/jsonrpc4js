import Response from '../type/response'

export default interface Client {
  call(method: string, ...args: any[]): Promise<any>

  handler(res: string): void
}
