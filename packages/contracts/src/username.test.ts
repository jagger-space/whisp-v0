import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeUsername } from './username'

// WHISP-003's proposed beta policy: trim/lowercase strings, then allow
// 3–20 ASCII letters, digits or underscores. These policy tests exercise
// the current string/throw API; the ticket's named result type is still pending.
const validationError = { name: 'Error', message: /username/i }

describe('normalizeUsername', () => {
    describe('canonical usernames', () => {
        it('normalizes Alice_1 and alice_1 to the same canonical value', () => {
            assert.equal(normalizeUsername('Alice_1'), 'alice_1')
            assert.equal(normalizeUsername('alice_1'), 'alice_1')
        })

        it('trims surrounding whitespace before lowercasing and validating', () => {
            assert.equal(normalizeUsername(' \tALICE_1\r\n'), 'alice_1')
        })

        for (const input of ['abc', '123', '___', 'a_1']) {
            it(`accepts the allowed character combination ${JSON.stringify(input)}`, () => {
                assert.equal(normalizeUsername(input), input)
            })
        }

        it('returns the same result repeatedly and when normalized again', () => {
            const first = normalizeUsername(' Alice_1 ')
            assert.equal(normalizeUsername(' Alice_1 '), first)
            assert.equal(normalizeUsername(first), first)
        })
    })

    describe('boundary lengths after trimming', () => {
        for (const length of [2, 21]) {
            it(`rejects ${length} characters`, () => {
                assert.throws(() => normalizeUsername('a'.repeat(length)), validationError)
            })
        }

        for (const length of [3, 20]) {
            it(`accepts ${length} characters even with surrounding whitespace`, () => {
                const input = 'A'.repeat(length)
                assert.equal(normalizeUsername(`  ${input}  `), 'a'.repeat(length))
            })
        }
    })

    describe('invalid strings', () => {
        for (const input of ['', '   ', '\t\r\n', 'alice bob', 'alice\tbob', 'alice\nbob', 'alice-bob', 'alice.bob', 'alice@bob', 'alice\0bob']) {
            it(`rejects empty, whitespace-only or forbidden characters in ${JSON.stringify(input)}`, () => {
                assert.throws(() => normalizeUsername(input), validationError)
            })
        }

        // Cyrillic a, Greek iota, full-width letters and accented Latin letters.
        for (const input of ['\u0430lice', 'al\u03b9ce', '\uff21\uff4c\uff49\uff43\uff45', 'al\u00edce', 'alice\ud83d\ude00']) {
            it(`rejects Unicode input ${JSON.stringify(input)}`, () => {
                assert.throws(() => normalizeUsername(input), validationError)
            })
        }
    })

    describe('runtime type validation', () => {
        const wrongTypes: ReadonlyArray<readonly [string, unknown]> = [
            ['undefined', undefined],
            ['null', null],
            ['a number that would otherwise form a valid username', 123],
            ['true', true],
            ['false', false],
            ['a bigint', 123n],
            ['a symbol', Symbol('alice')],
            ['an object', {}],
            ['an object without a prototype', Object.create(null)],
            ['an array containing a valid username', ['alice']],
            ['a boxed string', new String('alice')],
        ]

        for (const [label, input] of wrongTypes) {
            it(`rejects ${label} with a validation error`, () => {
                assert.throws(() => normalizeUsername(input), validationError)
            })
        }

        it('rejects an object without invoking user-defined string conversion', () => {
            let converted = false
            const input = {
                toString() {
                    converted = true
                    throw new TypeError('Unexpected string conversion')
                },
            }

            assert.throws(() => normalizeUsername(input), validationError)
            assert.equal(converted, false)
        })

        it('validates a string parsed from an HTTP JSON payload', () => {
            const input: unknown = JSON.parse('" Alice_1 "')
            assert.equal(normalizeUsername(input), 'alice_1')
        })

        // TypeScript's unknown annotation does not validate deserialized JSON.
        for (const json of ['123', 'null', 'true', '["alice"]', '{"username":"alice"}']) {
            it(`rejects the wrong-type JSON payload ${json} at runtime`, () => {
                const input: unknown = JSON.parse(json)
                assert.throws(() => normalizeUsername(input), validationError)
            })
        }
    })
})
