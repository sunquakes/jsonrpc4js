## [1.2.1] - 2026-11-16
- Fixed TCP framing for fragmented and coalesced packets.
- Fixed client treating falsy results (0, false, '', null) as errors.
- Fixed HTTP client never rejecting failed requests and leaking call timers.
- Fixed connection pool to reuse idle connections and round-robin over live
  addresses only.
- Fixed malformed JSON crashing the request handler instead of returning a
  parse error.
- Fixed Nacos heartbeat duplication and its timer keeping the process alive.
- Hardened request dispatch: inherited prototype members are refused and
  errors thrown inside a method return InternalError.
- Preserved custom service names on registration retries.

---

## [1.2.0] - 2024-03-04
- Support define custom service name when register service.

## [1.1.0] - 2024-03-03
- Compatible method formats /xxx/xxx.

## [1.0.3] - 2024-02-06
- Fixed server can not receive invalid object parameters.

---

## [1.0.2] - 2024-02-06
- Fixed server adapt to object params.

---

## [1.0.1] - 2024-02-02
- Edit client document.

---

## [1.0.0] - 2024-02-01
- Test intercommunicate stability with other moonquakes project.

---

## [0.0.2] - 2024-01-21
- Fixed nacos discovery filter unhealthy connection.
- Added service register retry.

---

## [0.0.1] - 2023-12-28

### Added
- Added tcp server and client.
- Added http server and client.
- Added consul registry and discovery.
- Added nacos registry and discovery.
