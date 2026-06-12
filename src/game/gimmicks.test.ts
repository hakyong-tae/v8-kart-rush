// src/game/gimmicks.test.ts
import { describe, it, expect } from 'vitest'
import { inSplineRange, cyclePhase, spinbarAngle } from './gimmicks'

describe('inSplineRange', () => {
  it('plain range', () => {
    expect(inSplineRange(0.5, 0.4, 0.6)).toBe(true)
    expect(inSplineRange(0.3, 0.4, 0.6)).toBe(false)
  })
  it('wrapping range (e.g. 0.95..0.05)', () => {
    expect(inSplineRange(0.98, 0.95, 0.05)).toBe(true)
    expect(inSplineRange(0.02, 0.95, 0.05)).toBe(true)
    expect(inSplineRange(0.5, 0.95, 0.05)).toBe(false)
  })
})

describe('determinism', () => {
  it('cyclePhase is a pure function of time (negative-safe)', () => {
    expect(cyclePhase(7.5, 5)).toBeCloseTo(0.5)
    expect(cyclePhase(-2.5, 5)).toBeCloseTo(0.5)
    expect(cyclePhase(12.5, 5)).toBe(cyclePhase(2.5, 5))
  })
  it('spinbarAngle same input → same output', () => {
    expect(spinbarAngle(3.3, 4)).toBe(spinbarAngle(3.3, 4))
    expect(spinbarAngle(0, 4)).toBeCloseTo(0)
    expect(spinbarAngle(2, 4)).toBeCloseTo(Math.PI)
  })
})

describe('boundaries', () => {
  it('cyclePhase wraps to 0 at exact period multiples', () => {
    expect(cyclePhase(5, 5)).toBe(0)
    expect(cyclePhase(0, 5)).toBe(0)
  })
  it('spinbarAngle wraps to 0 (not 2π) at period boundary', () => {
    expect(spinbarAngle(4, 4)).toBe(0)
  })
  it('inSplineRange exact endpoints inclusive', () => {
    expect(inSplineRange(0.4, 0.4, 0.6)).toBe(true)
    expect(inSplineRange(0.6, 0.4, 0.6)).toBe(true)
  })
})
