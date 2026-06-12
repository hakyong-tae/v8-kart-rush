// src/game/gimmicks.test.ts
import { describe, it, expect } from 'vitest'
import { inSplineRange, cyclePhase, spinbarAngle, bridgeY, bridgeSolid, pressY } from './gimmicks'

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

describe('sinkroad bridge', () => {
  it('solid while phase < duty', () => {
    expect(bridgeY(0.0, 0.55)).toBe(0)
    expect(bridgeY(0.54, 0.55)).toBe(0)
    expect(bridgeSolid(0.3, 0.55)).toBe(true)
  })
  it('sunk mid-cycle, rises at end', () => {
    expect(bridgeY(0.8, 0.55)).toBe(-6)
    expect(bridgeSolid(0.8, 0.55)).toBe(false)
    expect(bridgeY(0.96, 0.55)).toBeGreaterThan(-6)
    expect(bridgeY(1.0 - 1e-9, 0.55)).toBeCloseTo(0, 1)
  })
})

describe('press', () => {
  it('up most of the cycle, slams in window', () => {
    expect(pressY(0.3)).toBe(3.2)
    expect(pressY(0.83)).toBeLessThan(3.2)
    expect(pressY(0.9)).toBe(0.5)
    expect(pressY(0.97)).toBeGreaterThan(0.5)
  })
})
