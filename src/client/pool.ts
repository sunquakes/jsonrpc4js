import * as net from 'net'
import { splitAddress } from '../utils/address'
import Client from './client'
import Driver from 'discovery/driver'

type Option = {
  minIdle: number
  maxIdle: number
}

export default class Pool {
  /**
   * The remote service name.
   */
  private service: string

  /**
   * Service address.
   */
  private address: string | Driver

  /**
   * The client.
   */
  private client: Client

  /**
   * Active service address.
   */
  private activeAddresses: Array<string> = []

  /**
   * The number of active service address.
   */
  private activeTotal: number = 0

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

  constructor(service: string, address: string | Driver, client: Client, option?: Option) {
    this.service = service
    this.address = address
    this.client = client
    this.option = option || { minIdle: 1, maxIdle: 10 }
  }

  /**
   * Set the pool active addresses.
   * @returns
   */
  private async setActiveAddresses(): Promise<number> {
    let address: string
    if (typeof this.address == 'string') {
      address = this.address
    } else {
      address = await this.address.get(this.service)
    }
    const addresses = address.split(',')
    this.activeAddresses = addresses
    return this.activeAddresses.length
  }

  /**
   * Set the pool connections.
   */
  public async setConns() {
    await this.setActiveAddresses()
    for (let i = 0; i < this.option.minIdle; i++) {
      const conn = await this.createConn()
      this.conns.push(conn)
    }
  }

  /**
   * Create a tcp connection.
   * @returns
   */
  private async createConn(): Promise<net.Socket> {
    const size = this.activeAddresses.length
    if (size == 0) {
      await this.setActiveAddresses()
    }
    const key = this.activeTotal % size
    const address = this.activeAddresses[key]
    const socket = new net.Socket()
    const addressObj = splitAddress(address)

    let isRemoved = false
    return new Promise((resolve, reject) => {
      socket.connect(addressObj.port, addressObj.host, () => {
        socket.on('ready', () => {
          this.activeTotal++
          resolve(socket)
        })
        socket.on('close', () => {})
        socket.on('data', (data) => {
          this.client.handler(JSON.parse(data.toString()))
        })
        socket.on('error', (error) => {
          console.error('error', error)
          if (!isRemoved) {
            isRemoved = true
            delete this.activeAddresses[key]
            this.activeTotal--
          }
          reject(error)
        })
        socket.on('timeout', () => {
          if (!isRemoved) {
            isRemoved = true
            delete this.activeAddresses[key]
            this.activeTotal--
          }
          reject(new Error('Connection timeout.'))
        })
      })
    })
  }

  /**
   * Borrow a tcp connection from pool.
   * @returns
   */
  public async borrow(): Promise<net.Socket> {
    if (this.activeTotal <= 0) {
      await this.setConns()
    }
    if (this.activeTotal <= 0) {
      return Promise.reject(new Error('Unable to connect to the server.'))
    }
    if (this.activeTotal >= this.option.maxIdle) {
      return new Promise((resolve) => {
        const conn = this.conns.shift()
        if (conn !== undefined) {
          resolve(conn)
        } else {
          this.resolves.push(resolve)
        }
      })
    }
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
