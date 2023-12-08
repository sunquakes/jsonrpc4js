import * as http from 'http'

export function json(url: string, method: string, body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      url,
      {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
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
    request.write(body)
    request.end()
  })
}
