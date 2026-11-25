/**
 * LanguageSwitcher — dropdown selector for the active i18n locale.
 *
 * - Calls i18n.changeLanguage(lang) on selection
 * - Persists to localStorage under key 'ainet_locale' (in addition to the
 *   i18next default 'i18nextLng')
 * - Shows active language with a checkmark
 * - Keyboard-accessible: open with Enter/Space, navigate with arrow keys, select with Enter
 */
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../../i18n/options'
import type { SupportedLanguage } from '../../i18n/options'
import styles from './LanguageSwitcher.module.css'

const LOCALE_STORAGE_KEY = 'ainet_locale'

const LANGUAGE_DISPLAY: Record<SupportedLanguage, { label: string; nativeName: string }> = {
  en: { label: 'EN', nativeName: 'English' },
  es: { label: 'ES', nativeName: 'Español' },
  zh: { label: '中文', nativeName: '中文' },
}

export const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const activeLang = (i18n.resolvedLanguage ?? 'en') as SupportedLanguage
  const activeDisplay = LANGUAGE_DISPLAY[activeLang] ?? LANGUAGE_DISPLAY.en

  const handleSelect = useCallback(async (lang: SupportedLanguage) => {
    setOpen(false)
    localStorage.setItem(LOCALE_STORAGE_KEY, lang)
    await i18n.changeLanguage(lang)
    triggerRef.current?.focus()
  }, [i18n])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
  }, [])

  const handleOptionKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, lang: SupportedLanguage, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[index + 1]
      next?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[index - 1]
      if (prev) prev.focus(); else triggerRef.current?.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      void handleSelect(lang)
    }
  }, [handleSelect])

  return (
    <div
      className={styles.container}
      ref={containerRef}
      onKeyDown={handleKeyDown}
      data-testid="language-switcher"
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={t('a11y.languageSwitcher')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="language-switcher-trigger"
      >
        <Globe size={14} aria-hidden="true" />
        <span>{activeDisplay.label}</span>
        <ChevronDown size={12} aria-hidden="true" className={open ? styles.chevronOpen : ''} />
      </button>

      {open && (
        <ul
          role="menu"
          aria-label={t('a11y.languageSwitcher')}
          className={styles.menu}
        >
          {SUPPORTED_LANGUAGES.map((lang, index) => {
            const display = LANGUAGE_DISPLAY[lang]
            const isActive = lang === activeLang
            return (
              <li key={lang} role="presentation">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  className={`${styles.option} ${isActive ? styles.optionActive : ''}`}
                  onClick={() => void handleSelect(lang)}
                  onKeyDown={(e) => handleOptionKeyDown(e, lang, index)}
                  data-testid={`language-option-${lang}`}
                  autoFocus={isActive}
                >
                  <span className={styles.nativeName}>{display.nativeName}</span>
                  {isActive && <Check size={14} aria-hidden="true" className={styles.checkmark} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default LanguageSwitcher
