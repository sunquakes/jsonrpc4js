# Support Streamable HTTP (MCP-compatible transport)

## Context

`jsonrpc4js` currently ships two transports (`tcp`, `http`), both request/response only. The user asked to support **Streamable HTTP** — the MCP-style transport where a single HTTP endpoint carries JSON-RPC messages and can reply with either `application/json` or a `text/event-stream` (SSE) of multiple messages. Confirmed decisions:

- **MCP-compatible transport semantics**: `Mcp-Session-Id` sessions, `Mcp-Protocol-Version` negotiation, GET server→client SSE channel with keepalives, resumability via event `id:` + `Last-Event-ID`, DELETE to terminate. Dispatch stays this library's own (`Service/method`, registered instances) — we are not becoming an MCP server.
- **Server trigger**: a registered method returning an Array / generator / async iterable is streamed as one JSON-RPC result message per value over SSE; plain values keep single-JSON behavior.
- **Client API**: `call()` unchanged (unary); new `stream(method, ...args)` returns an AsyncIterable for `for await`. Shared `Server`/`Client` interfaces stay untouched.

Constraints: Node ≥ 22, zero runtime deps (built-ins only), strict TS, Prettier style (no semicolons, single quotes, width 100), default-export classes, options merged via `Object.assign`.

## Protocol wiring

- Switch string: `'streamable-http'` in [src/server.ts](file:///workspace/src/server.ts) and [src/client.ts](file:///workspace/src/client.ts) (pass `options` through).
- [src/index.ts](file:///workspace/src/index.ts): export `StreamableHttpServer`, `StreamableHttpClient`.
- Endpoint path default `/mcp` (option `path`); other paths → 404.
- Constants: `MCP_SESSION_HEADER = 'Mcp-Session-Id'`, `MCP_PROTOCOL_HEADER = 'Mcp-Protocol-Version'`, supported versions `['2025-06-18', '2025-03-26']`, default `'2025-06-18'`.

## 1. Refactor [src/server/handler.ts](file:///workspace/src/server/handler.ts) (no behavior change)

Keep the default `handler(message, map): string` byte-for-byte (tcp/http rely on it). Add named exports:

- `resolve(message, map)` — validation + named-param mapping (current lines 31–58: method-string check, `Service/method` split, map lookup, `Object.prototype` guard, cached `parameterObject2Array`), returning either `{ error }` (serialized JSON-RPC error) or `{ invoke: () => any }` (thunk, not yet called).
- `isStreamable(value)` — `value != null && typeof value !== 'string' && (Symbol.asyncIterator or Symbol.iterator present)`.

Run `pnpm test` after this step to prove tcp/http unaffected.

## 2. New `src/utils/sse.ts` — incremental SSE parser

`export default class SSEParser { feed(chunk: string): SSEEvent[] }` with `SSEEvent = { id, event, data, comments }`. Normalize CRLF/CR → LF; split events on blank line; keep partial frames in a buffer; `field: value` split on first `:`; multi-line `data:` joined with `\n`; `:` lines are comments (ignored, never dispatched); `id` persists across events (Last-Event-ID semantics). Must survive chunk boundaries mid-JSON and comment-only chunks.

## 3. New `src/server/streamable-http.ts` — `class StreamableHttp implements Server`

Options: `{ path: '/mcp', keepAliveInterval: 10000, replayBufferSize: 128, protocolVersions }`. Per-session state: bounded ring buffer of `{ id, frame }` + live GET streams + keepalive timer.

**POST** on `path`:
1. `Accept` must include both `application/json` and `text/event-stream` → else 406.
2. Session: unknown `Mcp-Session-Id` → 404; absent → issue `generateTimestampUUID()` and set the header on the response.
3. `Mcp-Protocol-Version`: unsupported → 400 echoing the latest supported; supported/absent → echo negotiated value.
4. Bad JSON body → 400 + `newError('', PARSE_ERROR)`.
5. Dispatch via `resolve()`: error → 200 JSON error frame. Await `invoke()`; throw → 200 JSON `INTERNAL_ERROR`. Non-streamable → 200 JSON single result (keep `undefined → null` normalization). Streamable → 200 `text/event-stream`, then `for await (const value of result)` writing frames `id: <uuid>\nevent: message\ndata: <json>\n\n` (each frame also buffered for replay); iteration throw → write `newError(id, INTERNAL_ERROR)` frame, then end. Honor backpressure with `await once(res, 'drain')` when `write()` returns false.

**GET**: `Accept: text/event-stream` required (406); session required (400/404); `Last-Event-ID` → replay buffered frames after that id verbatim (unknown id → 400), then keep the stream live; write `: keepalive\n\n` every `keepAliveInterval`; clear the timer when the last stream for the session closes (`res.on('close')`).

**DELETE**: session required; terminate its live streams, drop the session, 204. Other methods → 405.

`register()` mirrors [src/server/http.ts](file:///workspace/src/server/http.ts) with protocol string `'streamable-http'` and `REGISTER_RETRY_INTERVAL` retry. `handler(message): string` (interface requirement) delegates to the legacy sync `handler()` — documented as unused by the request pipeline. `start(callback)` passes the raw `http.Server` to the callback (test convention).

## 4. New `src/client/streamable-http.ts` — `class StreamableHttp implements Client`

Options: `{ path: '/mcp', callTimeout: 10000, streamIdleTimeout: 30000 }`. State: `sessionId`, negotiated `protocolVersion`, `activeAddresses`. Copy the private `getUrl()` address/Driver resolution pattern from [src/client/http.ts](file:///workspace/src/client/http.ts) (incl. dead-address filtering on `req.on('error')`). Headers helper always sends `Accept: application/json, text/event-stream` + version + session when set; absorb `Mcp-Session-Id`/`Mcp-Protocol-Version` from responses.

- `call(method, ...args)`: POST; on `application/json` resolve matching-id result (reject on `error`); on SSE, feed chunks through `SSEParser` and resolve the first `event: message` whose data id matches. 404 → clear session, reject `'Session not found'`. Timeout → destroy request, reject `'Timeout'` (same strings as http client).
- `async *stream(method, ...args)`: same POST; JSON response → yield the single result (or throw on error); SSE → yield each message's `result`, throw on `error` frames; per-frame idle timer; consumer stopping iteration naturally pauses the socket via `for await` on the response.
- `close()`: DELETE with session; 204/404/no-session all resolve cleanly.
- `handler(res: string)`: interface-compliance single-message dispatch like the http client; SSE bodies are consumed inline by `call`/`stream`.

## 5. Tests — new `__test__/streamable-http.test.ts` (ports 5010–5019)

Fixture service with `add(a,b)`, `async *range(n)`, `list(): number[]`, `async *boom()` (yields 1 then throws). `jest.mock('../src/utils/request')` for discovery cases, following [__test__/http.test.ts](file:///workspace/__test__/http.test.ts). Each test ends with `sleep(1000)`, `s.close()` **and `s.closeAllConnections()`** (Node 22) so live SSE sockets/keepalive timers don't hang jest.

1. Unary via `NewServer`/`NewClient` factories; method-not-found error string.
2. `stream()` over async generator and array; `boom()` yields 1 then throws; `call('range',2)` resolves first result; `stream()` on a unary method yields the single value.
3. Session lifecycle with raw `http.request`: header issued, echoed, bogus → 404, DELETE → 204, then 404; two `call()`s reuse one session.
4. SSE frame format via raw request; `Accept: text/plain` → 406.
5. Resumability: capture event ids, GET with `Last-Event-ID` replays only later frames; unknown id → 400.
6. GET keepalive comment arrives with small `keepAliveInterval`; version negotiation echo + unsupported → 400.
7. Parse error → 400 with `-32700`.
8. `close()` then `call()` still works (new session).
9. Consul/Nacos mocked variants resolve and call successfully.
10. `SSEParser` unit: split chunks mid-JSON, CRLF, comment-only chunks, multi-line data.

## Execution order

1. `src/server/handler.ts` refactor → run full `pnpm test`.
2. `src/utils/sse.ts`.
3. `src/server/streamable-http.ts`.
4. `src/client/streamable-http.ts`.
5. Wire `src/server.ts`, `src/client.ts`, `src/index.ts`.
6. `__test__/streamable-http.test.ts`.

## Verification

```bash
pnpm test __test__/streamable-http.test.ts
npx tsc --noEmit        # babel-jest does not type-check
pnpm test               # full regression (tcp/http/discovery)
pnpm build              # rollup bundle includes new modules
```

## Risks / notes

- `undefined` results normalized to `null` in both single-JSON and per-frame paths.
- Replay buffer hard-bounded; `Last-Event-ID` older than the window → 400. Sessions never expire (known limitation, acceptable for this library).
- Keepalive timers must be cleared on stream close or jest hangs on open handles.
- No public API changes to `Server`/`Client` interfaces; `stream()`/`close()` exist only on the concrete client class (reachable via `StreamableHttpClient` export or cast).
- No runtime dependencies added.
