import Request from "../type/request"

export default interface Server {
  setOptions(options: any): void

  start(callback?: Function): void

  register(o: object): void

  handler(message: Request): string
}
