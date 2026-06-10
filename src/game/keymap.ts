// Configurable key bindings, persisted to localStorage.
export type Action = 'accel' | 'brake' | 'left' | 'right' | 'drift' | 'item' | 'reset'

export const ACTIONS: Action[] = ['accel', 'brake', 'left', 'right', 'drift', 'item', 'reset']

const DEFAULTS: Record<Action, string[]> = {
  accel: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  drift: ['ShiftLeft', 'ShiftRight', 'Space'],
  item: ['ControlLeft', 'KeyE'],
  reset: ['KeyR'],
}

const LS_KEY = 'v8kart_keymap'

let bindings: Record<Action, string[]> = load()

function load(): Record<Action, string[]> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const out = { ...DEFAULTS }
      for (const a of ACTIONS) if (Array.isArray(parsed[a]) && parsed[a].length) out[a] = parsed[a]
      return out
    }
  } catch {}
  return { ...DEFAULTS }
}

export function keysFor(action: Action): string[] {
  return bindings[action]
}

export function allBoundKeys(): Set<string> {
  return new Set(ACTIONS.flatMap((a) => bindings[a]))
}

export function setBinding(action: Action, code: string) {
  // remove the key from any other action first, then assign as that action's primary key
  for (const a of ACTIONS) bindings[a] = bindings[a].filter((c) => c !== code)
  bindings[action] = [code]
  localStorage.setItem(LS_KEY, JSON.stringify(bindings))
}

export function resetBindings() {
  bindings = { ...DEFAULTS }
  localStorage.removeItem(LS_KEY)
}

export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', Space: 'Space',
    ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', Enter: 'Enter', Tab: 'Tab',
  }
  if (map[code]) return map[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}
