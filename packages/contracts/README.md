# Shared contracts tests

The username tests cover WHISP-003's proposed beta policy: trim and lowercase
strings, then accept only 3–20 ASCII letters, digits or underscores. This is a
proposal rather than a replacement for the full architecture's naming policy.

From the repository root:

```sh
npm ci --prefix packages/contracts
npm test --prefix packages/contracts
npm run typecheck --prefix packages/contracts
```

Tests use Node's test runner through `tsx`. They cover canonicalization, lengths
2/3/20/21, empty and whitespace-only strings, forbidden characters, Unicode
lookalikes, wrong runtime types and JSON values. They exercise a pure function
without a database, React state or network dependencies.

The current implementation coerces inputs with `String(input)`, so the wrong-type
tests expose failures rather than accepting coercion as intended behavior.
Invalid inputs must produce a deliberate validation failure instead of an
unexpected coercion exception. Tests currently use the existing string/throw API;
WHISP-003's named success/failure result remains an implementation change and
will require updating the result assertions when that contract is defined.

Validation on 25 October 2026 (Node.js 26.8.1): 44 tests ran, with 30 passing and
14 failing on the existing coercion behavior. `npm run typecheck` passed. The
validator implementation was left unchanged.
