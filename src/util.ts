export function fmtTime(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "--'--.---"
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const milli = Math.floor(ms % 1000)
  return `${m}'${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`
}
