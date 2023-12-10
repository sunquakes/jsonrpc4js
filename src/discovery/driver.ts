export default interface Driver {
  register(name: string, protocol: string, hostname: string, port: number): Promise<string>

  get(name: string): Promise<string>
}
