import * as http from 'http'

export function json(url: string, method: string, body: string | null): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body ? Buffer.byteLength(body) : 0
        }
      },
      (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          resolve(data)
        })
      }
    )
    request.on('error', (error: Error) => {
      reject(error)
    })
    if (body) {
      request.write(body)
    }
    request.end()
  })
}

export function get(url: string): Promise<any> {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        resolve(data)
      })
    })
  })
}
