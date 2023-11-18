export default interface Server {
  setOptions(options: any): void

  start(callback?: Function): void

  register(o: Object): void
}
