export default interface Client {
  call(method: string, ...args: any[]): Promise<any>
}
