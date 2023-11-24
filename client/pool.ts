import * as net from 'net'
import { splitAddress } from '../utils/address'

type Option = {
  minIdle: number
  maxIdle: number
}

export default class Pool {
  /**
   * Service address.
   */
  private address: string

  /**
   * Active service address.
   */
  private activeAddresses: Array<string>

  /**
   * The number of active service address.
   */
  private activeTotal: number

  /**
   * The service connections.
   */
  private conns: Array<net.Socket>

  private resolves: Array<Function>

  private option: Option

  constructor(address: string, option: Option) {
    this.address = address
    this.option = option
    this.activeTotal = this.setActiveAddresses()
    this.conns = []
    this.resolves = []
    this.activeAddresses = []
    this.setConns()
  }

  private setActiveAddresses(): number {
    const addresses = this.address.split(',')
    this.activeAddresses = addresses
    return this.activeAddresses.length
  }

  private setConns() {
    for (let i = 0; i < this.option.minIdle; i++) {
      const conn = this.createConn()
      this.conns.push(conn)
      this.activeTotal++
    }
  }

  private createConn() {
    const size = this.activeAddresses.length
    if (size == 0) {
      this.setActiveAddresses()
    }
    const key = this.activeTotal % size
    const address = this.activeAddresses[key]
    const socket = new net.Socket()
    const addressObj = splitAddress(address)

    socket.connect(addressObj.port, addressObj.host, () => {
      socket.on('close', () => {})
      socket.on('data', (data) => {})
    })
    return socket
  }

  public borrow(): Promise<net.Socket> {
    if (this.activeTotal <= 0) {
      throw new Error('Unable to connect to the server.')
    }
    if (this.activeTotal > this.option.maxIdle) {
      return new Promise((resolve) => {
        const conn = this.conns.shift()
        if (conn !== undefined) {
          resolve(conn)
        } else {
          this.resolves.push(resolve)
        }
      })
    }
    const conn = this.createConn()
    this.activeTotal++
    return new Promise(() => conn)
  }

  public release(conn: net.Socket): void {
    const resolve = this.resolves.shift()
    if (resolve !== undefined) {
      resolve(conn)
    } else {
      this.conns.push(conn)
    }
  }
}
