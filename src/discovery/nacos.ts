import Driver from './driver'
import querystring from 'querystring'
import { get } from '../utils/request'

type Service = {
  ip: string
  port: number
  healthy: boolean
  instanceId: string
}

export default class Nacos implements Driver {
  private url: string

  private heartbeatList: Array<Service>

  private heartbeatRetry: Map<string, number>

  constructor(url: string) {
    this.url = url
  }

  register(name: string, protocol: string, hostname: string, port: number): Promise<string> {
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
    return get(registerUrl)
  }

  get(name: string): Promise<string> {
    const parsedUrl = new URL(this.url)
    let params = new Map<string, any>()
    params.set('serviceName', name)
    const getUrl = this.getUrl(parsedUrl, `/nacos/v1/ns/instance/list`, params)
    return get(getUrl).then((res) => {
      res = JSON.parse(res)
      if (!res || !res.hosts) {
        return ''
      }
      return res.hosts.map((item: Service) => `${item.ip}:${item.port}`).join(',')
    })
  }

  private getUrl(parsedUrl: URL, path: string, params: Map<string, string>): string {
    parsedUrl.pathname = path
    for (let [key, value] of params) {
      parsedUrl.searchParams.append(key, value)
    }
    return parsedUrl.toString()
  }
}
