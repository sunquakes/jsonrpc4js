export default interface Driver {
  register(name: string, protocol: string, hostname: string, port: number): Promise<boolean>

  get(name: string): Promise<string>
}
