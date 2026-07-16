# Zod 4 migration contract

This repository upgrades from Zod 3.25.76 to Zod 4.4.3 using the official
[Zod 4 migration guide](https://zod.dev/v4/changelog) as the compatibility
reference. The migration is limited to validation-library compatibility; it
does not redesign schemas, API contracts, or persisted data.

## Repository audit

The application has nineteen Zod-owning source files. The migration audit
covered every import, schema, parse boundary, inferred output, refinement,
default, coercion, record, enum, union, strict object, and error formatter.

The breaking changes that require repository edits are:

- `z.record()` now requires explicit key and value schemas. Strategic JSON and
  structured targets use `z.record(z.string(), StrategyJsonValueSchema)`;
  average-entry payloads use `z.record(z.string(), z.unknown())` because their
  domain-specific fields are validated after the transport parse.
- Zod's generic base type no longer needs `ZodTypeAny`. The shared editing
  parser now accepts `Schema extends z.ZodType` and preserves `z.output<Schema>`.
- The directly used refinement option objects use the current `error`
  property while retaining their existing messages and paths.
- Bare `z.unknown()` object properties are required in Zod 4. The distribution
  band PATCH wrapper marks its opaque `band` and `order` payloads optional so a
  missing payload continues to reach domain validation and returns the existing
  structured error response.
- Zod 4 changed built-in English issue text. All application schemas import the
  configured wrapper in `src/lib/zod.ts`, which preserves Zod 3.25 default
  messages while allowing schema-level custom messages to retain precedence.
- Directly replaceable chained email formats use Zod 4's top-level `z.email()`
  API. The audit email schema pipes its existing trim step into `z.email()` so
  whitespace acceptance and parsed output remain unchanged. Datetimes validate
  through `z.iso.datetime()` after replacing a terminal Zod 3-shaped offset
  (`+0400` or `+04:00`) with `Z` for validation only; the original string is
  returned unchanged. Zod 3 did not range-check offset digits, so this also
  preserves potentially persisted values such as `+9999` while using the
  current Zod 4 format API for the date and time portion.

The audit found no use of removed `.errors`, `ctx.path`, error maps,
`invalid_type_error`, `required_error`, recursive type-predicate refinements,
`z.nativeEnum()`, `.nonempty()` tuple inference, UUID schemas, intersections,
`.deepPartial()`, `.nonstrict()`, or static schema factories.

## Compatibility decisions

- Recursive strategic JSON remains explicitly typed as `StrategyJsonValue`;
  no `any` escape hatch is introduced.
- String record keys and their exact value domains are explicit. Enum-keyed
  record exhaustiveness is not involved.
- Existing `.strict()` calls remain because replacing every strict-object
  construction would add broad unrelated churn. Zod 4 continues to support
  the method and the contract tests verify unknown-key rejection.
- API boundaries use Zod 4's supported `z.flattenError()` helper and retain the
  existing `{ formErrors, fieldErrors }` response shape and message text.
- Existing outermost defaults remain unchanged. Production-compatible fixture
  tests assert the parsed output, including omitted keys versus inserted null,
  boolean, numeric, and enum defaults.
- The two coercing query boundaries continue to accept numeric URL strings and
  reject invalid numeric input. JSON mutation bodies remain non-coercing.
- Zod 4 rejects integers outside JavaScript's safe-integer range. This is the
  only intentional acceptance change: such IDs, years, counts, and ordering
  values cannot be represented safely by the JavaScript/SQLite boundary.

## Regression evidence

`src/features/strategy/zod-migration-contract.test.ts` runs the same persisted
configuration, structured target, recursive plan/priority/goal/measure JSON,
observation payloads, and audit snapshots that passed under Zod 3. It verifies
the same parsed output under Zod 4, along with record domains, strict unknown
fields, missing data, defaults, error paths/messages, single versus batch API
payloads, numeric coercion boundaries, and safe-integer enforcement. The suite
also loads serialized `structured_target_json`, `previous_value_json`, and
`new_value_json` through the production row adapters before schema validation.
