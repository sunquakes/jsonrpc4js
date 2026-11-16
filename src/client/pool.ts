import * as net from 'net'
import { splitAddress } from '../utils/address'
import Client from './client'
import Driver from '../discovery/driver'

type Option = {
  minIdle: number
  maxIdle: number
  delimiter: string
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
   * The number of live connections.
   */
  private activeTotal: number = 0

  /**
   * The number of connections created, used for round-robin.
   */
  private created: number = 0

  /**
   * The idle service connections.
   */
  private conns: Array<net.Socket> = []

  /**
   * The resolve queue that connection.
   */
  private resolves: Array<(conn: net.Socket) => void> = []

  /**
   * The tcp connection option.
   */
  private option: Option

  /**
   * Whether the minimum idle connections have been initialized.
   */
  private initialized: boolean = false

  constructor(service: string, address: string | Driver, client: Client, option?: Partial<Option>) {
    this.service = service
    this.address = address
    this.client = client
    this.option = Object.assign({ minIdle: 1, maxIdle: 10, delimiter: '\r\n' }, option)
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
    this.activeAddresses = address
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    return this.activeAddresses.length
  }

  /**
   * Set the pool connections.
   */
  public async setConns(): Promise<void> {
    await this.setActiveAddresses()
    for (let i = 0; i < this.option.minIdle; i++) {
      this.conns.push(await this.createConn())
    }
  }

  /**
   * Create a tcp connection.
   * @returns
   */
  private async createConn(): Promise<net.Socket> {
    if (this.activeAddresses.length == 0) {
      await this.setActiveAddresses()
    }
    const size = this.activeAddresses.length
    if (size == 0) {
      throw new Error('No valid server available.')
    }
    const address = this.activeAddresses[this.created % size]
    const addressObj = splitAddress(address)
    const socket = new net.Socket()
    const delimiter = this.option.delimiter
    let buffer = ''

    // Decode as utf8 at the stream level so multi-byte characters split
    // across chunks are handled correctly.
    socket.setEncoding('utf8')
    socket.on('data', (data: string) => {
      buffer += data
      let index = buffer.indexOf(delimiter)
      while (index !== -1) {
        const message = buffer.substring(0, index)
        buffer = buffer.substring(index + delimiter.length)
        if (message.length > 0) {
          this.client.handler(message)
        }
        index = buffer.indexOf(delimiter)
      }
    })

    let ready = false
    return new Promise((resolve, reject) => {
      socket.on('ready', () => {
        ready = true
        this.created++
        this.activeTotal++
        resolve(socket)
      })
      socket.on('close', () => {
        if (ready) {
          ready = false
          this.activeTotal--
        }
      })
      socket.on('error', (error) => {
        this.activeAddresses = this.activeAddresses.filter((item) => item !== address)
        socket.destroy()
        if (ready) {
          // The connection was already handed out, the close handler will
          // keep the counters in sync.
          return
        }
        reject(error)
      })
      socket.on('timeout', () => {
        socket.destroy()
        if (!ready) {
          reject(new Error('Connection timeout.'))
        }
      })
      socket.connect(addressObj.port, addressObj.host)
    })
  }

  /**
   * Borrow a tcp connection from pool.
   * @returns
   */
  public async borrow(): Promise<net.Socket> {
    if (!this.initialized) {
      this.initialized = true
      await this.setConns()
    }
    const idle = this.conns.shift()
    if (idle !== undefined && !idle.destroyed) {
      return idle
    }
    if (this.activeTotal < this.option.maxIdle) {
      return this.createConn()
    }
    return new Promise((resolve) => {
      this.resolves.push(resolve)
    })
  }

  /**
   * Release a tcp connection to the pool.
   * @param conn
   */
  public release(conn: net.Socket): void {
    if (conn.destroyed) {
      return
    }
    const resolve = this.resolves.shift()
    if (resolve !== undefined) {
      resolve(conn)
    } else if (this.conns.length < this.option.maxIdle) {
      this.conns.push(conn)
    } else {
      conn.destroy()
    }
  }
}
