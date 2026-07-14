# Effect guidelines

Effect is the application model, not an error-handling utility added at the edges.

## Required boundaries

- Files, paths, terminals, commands, HTTP servers, and runtime integration use `@effect/platform` plus the platform implementation.
- Configuration uses `Config`; secrets use `Config.redacted` and never appear in logs or errors.
- Application logging uses Effect logging. `console` is not used.
- Recoverable failures are typed errors. Defects represent violated internal invariants or an adapter declaration that cannot be implemented.
- JSON parsing at schema boundaries uses `Schema.parseJson`. Other native or third-party calls that can throw live in `src/libraries` and return `Effect`.
- Library wrappers preserve the original call surface with `Parameters<typeof fn>` or `ConstructorParameters<typeof Class>` instead of inventing a wider abstraction.
- Optional wire properties decode to `Option`. Domain and application types do not use `undefined` to represent absence.

## Time and nondeterminism

Use `DateTime` for instants and calendar-aware computation, `Duration` for elapsed time, and Effect `Clock` for the current time or sleeping. Do not use `Date`, numeric millisecond durations, `Date.now`, timers, or random IDs directly. Serialized API date/time fields remain strings at the transfer boundary; the backend validates full date-times with `Schema.DateTimeUtc` and adapters choose the explicit UI control.

The current code has no scheduling, retry delay, cache expiry, generated timestamp, or random identifier. Therefore it introduces no clock, duration, or random service merely to manufacture metadata.

## Exhaustiveness

Domain variants use tagged Schema unions or literal unions. Matching code handles every member without a catch-all renderer. If the domain adds a field kind, editor kind, pagination mode, target, or contract version, compilation must fail until each consumer implements it.

An explicit “unsupported operation” error is acceptable at an external request boundary. Silently coercing an unsupported domain value to a generic string, input, endpoint, or component is not.
