export * from './types'
import type { CourseDef } from './types'
import { sunny } from './sunny'
import { canyon } from './canyon'
import { ice } from './ice'
import { beach } from './beach'
import { neon } from './neon'

export const COURSES: CourseDef[] = [sunny, canyon, ice, beach, neon]

export function getCourse(id: string): CourseDef {
  const c = COURSES.find((c) => c.id === id)
  if (!c) throw new Error(`unknown course: ${id}`)
  return c
}
