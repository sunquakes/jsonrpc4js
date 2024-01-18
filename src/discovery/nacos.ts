import Driver from './driver'
import querystring from 'querystring'
import { get, json } from '../utils/request'

const HEARTBEAT_INTERVAL = 5000 // ms
const HEARTBEAT_RETRY_MAX = 3 // times

type Service = {
  ip: string
  port: number
  healthy: boolean
  instanceId: string
}

export default class Nacos implements Driver {
  private url: string

  private heartbeatList: Array<Service> = new Array()

  private heartbeatRetry: Map<string, number> = new Map()

  constructor(url: string) {
    this.url = url
    this.heatbeat()
  }

  async register(name: string, protocol: string, hostname: string, port: number): Promise<string> {
    const parsedUrl = new URL(this.url)
    const queryParams = querystring.parse(parsedUrl.search.slice(1))
    let ephemeral = queryParams.ephemeral
    if (ephemeral === undefined) {
      ephemeral = 'true'
    }

    let params = new Map<string, any>()
    params.set('serviceName', name)
    params.set('ip', hostname)
    params.set('port', port.toString())
    params.set('ephemeral', ephemeral)

    const registerUrl = this.getUrl(parsedUrl, '/nacos/v1/ns/instance', params)
    const res = await json(registerUrl, 'POST', null)
    if (ephemeral === 'true') {
      this.heartbeatList.push({ ip: hostname, port: port, healthy: true, instanceId: name })
    }
    return res
  }

  async get(name: string): Promise<string> {
    const parsedUrl = new URL(this.url)
    let params = new Map<string, any>()
    params.set('serviceName', name)
    const getUrl = this.getUrl(parsedUrl, `/nacos/v1/ns/instance/list`, params)
    const res: string = await get(getUrl)
    const body = JSON.parse(res)
    if (!body || !body.hosts) {
      return ''
    }
    return body.hosts.map((item: Service) => `${item.ip}:${item.port}`).join(',')
  }

  beat(name: string, hostname: string, port: number): Promise<string> {
    const parsedUrl = new URL(this.url)
    const queryParams = querystring.parse(parsedUrl.search.slice(1))
    let ephemeral = queryParams.ephemeral
    if (ephemeral === undefined) {
      ephemeral = 'true'
    }

    let params = new Map<string, any>()
    params.set('serviceName', name)
    params.set('ip', hostname)
    params.set('port', port.toString())
    params.set('ephemeral', ephemeral)
    const beatUrl = this.getUrl(parsedUrl, '/nacos/v1/ns/instance/beat', params)
    return json(beatUrl, 'PUT', null)
  }

  private heatbeat() {
    for (let i = 0; i < this.heartbeatList.length; i++) {
      const service = this.heartbeatList[i]
      const instanceId = service.instanceId
      const ip = service.ip
      const port = service.port
      this.beat(instanceId, ip, port).catch((error) => {
        const key = `${ip}:${port}`
        const times = this.heartbeatRetry.get(key)
        if (times === undefined) {
          this.heartbeatRetry.set(key, 1)
        } else {
          if (times >= HEARTBEAT_RETRY_MAX) {
            this.heartbeatList.splice(i, 1)
            this.heartbeatRetry.delete(key)
          } else {
            this.heartbeatRetry.set(key, times + 1)
          }
        }
      })
    }
    setTimeout(() => {
      this.heatbeat()
    }, HEARTBEAT_INTERVAL)
  }

  private getUrl(parsedUrl: URL, path: string, params: Map<string, string>): string {
    parsedUrl.pathname = path
    for (let [key, value] of params) {
      parsedUrl.searchParams.append(key, value)
    }
    return parsedUrl.toString()
  }
}
