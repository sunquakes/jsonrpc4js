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
   * The response handler.
   */
  private handler: Function

  /**
   * Active service address.
   */
  private activeAddresses: Array<string> = []

  /**
   * The number of active service address.
   */
  private activeTotal: number

  /**
   * The service connections.
   */
  private conns: Array<net.Socket> = []

  /**
   * The resolve queue that connection.
   */
  private resolves: Array<Function> = []

  /**
   * The tcp connection option.
   */
  private option: Option

  constructor(address: string, handler: Function, option?: Option) {
    this.address = address
    this.handler = handler
    this.option = option || { minIdle: 1, maxIdle: 10 }
    this.activeTotal = this.setActiveAddresses()
    this.setConns()
  }

  /**
   * Set the pool active addresses.
   * @returns
   */
  private setActiveAddresses(): number {
    const addresses = this.address.split(',')
    this.activeAddresses = addresses
    return this.activeAddresses.length
  }

  /**
   * Set the pool connections.
   */
  private async setConns() {
    for (let i = 0; i < this.option.minIdle; i++) {
      const conn = await this.createConn()
      this.conns.push(conn)
      this.activeTotal++
    }
  }

  /**
   * Create a tcp connection.
   * @returns
   */
  private createConn(): Promise<net.Socket> {
    const size = this.activeAddresses.length
    if (size == 0) {
      this.setActiveAddresses()
    }
    const key = this.activeTotal % size
    const address = this.activeAddresses[key]
    const socket = new net.Socket()
    const addressObj = splitAddress(address)

    return new Promise((resolve, reject) => {
          console.info('123', addressObj)
      socket.connect(addressObj.port, addressObj.host, () => {
        socket.on('connect', () => {
          resolve(socket)
        })
        socket.on('close', () => {})
        socket.on('data', (data) => {
          this.handler(JSON.parse(data.toString()))
        })
        socket.on('error', (error) => {
          console.error('error', error)
          delete this.activeAddresses[key]
          reject(error)
        })
        socket.on('timeout', () => {
          console.info('123456', addressObj)
          delete this.activeAddresses[key]
          reject(new Error('Connection timeout.'))
        })
      })
    })
  }

  /**
   * Borrow a tcp connection from pool.
   * @returns
   */
  public borrow(): Promise<net.Socket> {
    if (this.activeTotal <= 0) {
      return Promise.reject(new Error('Unable to connect to the server.'))
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
    this.activeTotal++
    return this.createConn()
  }

  /**
   * Release a tcp connection to the pool.
   * @param conn
   */
  public release(conn: net.Socket): void {
    const resolve = this.resolves.shift()
    if (resolve !== undefined) {
      resolve(conn)
    } else {
      this.conns.push(conn)
    }
  }
}
