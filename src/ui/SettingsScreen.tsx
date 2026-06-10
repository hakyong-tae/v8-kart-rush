import { useEffect, useState } from 'react'
import { audio } from '../game/audio'
import {
  ACTIONS,
  keysFor,
  setBinding,
  resetBindings,
  keyLabel,
  type Action,
} from '../game/keymap'
import { useI18n, type Lang } from '../i18n'

const ACTION_LABEL_KEY: Record<Action, 'actAccel' | 'actBrake' | 'actLeft' | 'actRight' | 'actDrift' | 'actItem' | 'actReset'> = {
  accel: 'actAccel',
  brake: 'actBrake',
  left: 'actLeft',
  right: 'actRight',
  drift: 'actDrift',
  item: 'actItem',
  reset: 'actReset',
}

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useI18n()
  const [bgm, setBgm] = useState(Math.round(audio.bgmVol * 100))
  const [sfx, setSfx] = useState(Math.round(audio.sfxVol * 100))
  const [capturing, setCapturing] = useState<Action | null>(null)
  const [, bump] = useState(0) // re-render after rebinding

  // key capture for rebinding
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.code !== 'Escape') setBinding(capturing, e.code)
      setCapturing(null)
      bump((x) => x + 1)
    }
    window.addEventListener('keydown', onKey, { once: true })
    return () => window.removeEventListener('keydown', onKey)
  }, [capturing])

  return (
    <div className="screen center-col">
      <h2>{t('settingsTitle')}</h2>

      <div className="card settings-card">
        <div className="setting-row">
          <span className="setting-label">{t('bgmVolume')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={bgm}
            onChange={(e) => {
              const v = Number(e.target.value)
              setBgm(v)
              audio.setBgmVol(v / 100)
            }}
          />
          <span className="setting-val">{bgm}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">{t('sfxVolume')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={sfx}
            onChange={(e) => {
              const v = Number(e.target.value)
              setSfx(v)
              audio.setSfxVol(v / 100)
              audio.resume()
              audio.pickup() // preview blip
            }}
          />
          <span className="setting-val">{sfx}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">{t('language')}</span>
          <div className="row gap">
            {(['en', 'ko'] as Lang[]).map((l) => (
              <button
                key={l}
                className={`btn small ${lang === l ? 'on' : ''}`}
                onClick={() => setLang(l)}
              >
                {l === 'en' ? 'English' : '한국어'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card settings-card">
        <h4 className="settings-sub">{t('keymap')}</h4>
        {ACTIONS.map((a) => (
          <div key={a} className="setting-row">
            <span className="setting-label">{t(ACTION_LABEL_KEY[a])}</span>
            <button
              className={`btn small keycap ${capturing === a ? 'on' : ''}`}
              onClick={() => setCapturing(a)}
            >
              {capturing === a ? t('pressKey') : keysFor(a).map(keyLabel).join(' / ')}
            </button>
          </div>
        ))}
        <button
          className="btn small"
          onClick={() => {
            resetBindings()
            bump((x) => x + 1)
          }}
        >
          {t('resetDefaults')}
        </button>
      </div>

      <button className="btn primary" onClick={onClose}>
        {t('done')}
      </button>
    </div>
  )
}
