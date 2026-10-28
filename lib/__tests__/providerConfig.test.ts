import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PROVIDERS, getProviderById, getModelsForProvider } from '../ai/providerConfig'

const ROOT = join(__dirname, '..', '..')
const CONFIG_FILE = join(ROOT, 'lib', 'ai', 'providerConfig.ts')
const SKIP_DIRS = new Set(['node_modules', '.next', 'out', '.claude', '.git', 'public', 'scripts'])

function walkSource(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      results.push(...walkSource(full))
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.spec.tsx') &&
      !entry.endsWith('.test.tsx')
    ) {
      results.push(full)
    }
  }
  return results
}

// Extracted so it can be tested in isolation (see scan coverage tests below).
export function scanLiterals(src: string, forbidden: Set<string>): string[] {
  const violations: string[] = []
  const re =
    /(?:'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const lit = m[1] ?? m[2] ?? m[3]
    if (forbidden.has(lit)) violations.push(lit)
  }
  return violations
}

describe('providerConfig', () => {
  describe('AC1 & AC3: structural literal scan', () => {
    it('no non-test source file outside the config module contains a forbidden provider ID or model string literal', () => {
      const forbidden = new Set<string>()
      for (const p of PROVIDERS) {
        forbidden.add(p.id)
        for (const m of p.models) {
          forbidden.add(m)
        }
      }

      const files = walkSource(ROOT).filter((f) => f !== CONFIG_FILE)
      const violations: string[] = []

      for (const file of files) {
        const src = readFileSync(file, 'utf-8')
        const rel = relative(ROOT, file)
        for (const lit of scanLiterals(src, forbidden)) {
          const lineNum = src.slice(0, src.indexOf(lit)).split('\n').length
          violations.push(`${rel}:${lineNum} — "${lit}"`)
        }
      }

      expect(violations).toEqual([])
    })

    describe('scan coverage: literal forms caught', () => {
      const forbidden = new Set(['anthropic', 'gpt-4o'])

      it('catches single-quoted literals', () => {
        expect(scanLiterals("const p = 'anthropic'", forbidden)).toContain('anthropic')
      })

      it('catches double-quoted literals', () => {
        expect(scanLiterals('const p = "anthropic"', forbidden)).toContain('anthropic')
      })

      it('catches backtick template literals', () => {
        // This will fail until the backtick regex arm is added to scanLiterals
        expect(scanLiterals('const p = `anthropic`', forbidden)).toContain('anthropic')
      })

      it('does not flag non-forbidden strings', () => {
        expect(scanLiterals("const x = 'google'", forbidden)).toEqual([])
      })
    })
  })

  describe('AC4: graceful degradation for unknown stored values', () => {
    it('getProviderById returns undefined for an unknown provider', () => {
      expect(getProviderById('unknown-provider')).toBeUndefined()
    })

    it('getModelsForProvider returns empty array for an unknown provider', () => {
      expect(getModelsForProvider('unknown-provider')).toEqual([])
    })

    it('getProviderById returns defined config for a known provider', () => {
      const first = PROVIDERS[0]
      const p = getProviderById(first.id)
      expect(p).toBeDefined()
      expect(p!.label).toBe(first.label)
      expect(p!.models.length).toBeGreaterThan(0)
    })
  })
})
