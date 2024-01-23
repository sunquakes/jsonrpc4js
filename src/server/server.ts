import Request from "../type/request"

export const REGISTER_RETRY_INTERVAL = 5000;

export default interface Server {
  setOptions(options: any): void

  start(callback?: Function): void

  register(o: object): Promise<void>

  handler(message: Request): string
}
