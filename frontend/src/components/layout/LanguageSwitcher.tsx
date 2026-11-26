/**
 * LanguageSwitcher — standalone dropdown component for switching the active locale.
 *
 * - Calls `i18n.changeLanguage(lang)` on selection.
 * - Persists the chosen language to `localStorage` under the key `ainet_locale`.
 * - Shows the currently active language with a ✓ checkmark.
 * - Keyboard-accessible: `Enter`/`Space` toggles the dropdown, `Escape` closes it,
 *   `ArrowDown` opens it; each option responds to `Enter`/`Space`/`Escape`.
 * - ARIA semantics: `role="listbox"`, `role="option"`, `aria-selected`,
 *   `aria-expanded`, `aria-haspopup`.
 * - Closes on outside click via a `mousedown` listener.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../../i18n/options'
import type { SupportedLanguage } from '../../i18n/options'

/** The localStorage key used to persist the user's language preference. */
export const LANGUAGE_STORAGE_KEY = 'ainet_locale'

/** Human-readable labels for each supported language (never translated). */
const LANGUAGE_LABELS: Record<SupportedLanguage, { flag: string; nativeName: string }> = {
  en: { flag: '🇬🇧', nativeName: 'English' },
  es: { flag: '🇪🇸', nativeName: 'Español' },
  zh: { flag: '🇨🇳', nativeName: '中文' },
}

export interface LanguageSwitcherProps {
  /** Additional CSS class applied to the root element. */
  className?: string
}

/**
 * Dropdown language switcher.
 *
 * Usage:
 * ```tsx
 * import { LanguageSwitcher } from './LanguageSwitcher'
 * <LanguageSwitcher />
 * ```
 */
export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className }) => {
  const { t, i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeLanguage = (i18n.resolvedLanguage ?? 'en') as SupportedLanguage
  const activeLabel = LANGUAGE_LABELS[activeLanguage]

  const changeLanguage = useCallback(
    (lang: SupportedLanguage) => {
      void i18n.changeLanguage(lang)
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
      setIsOpen(false)
    },
    [i18n],
  )

  // Close on outside click.
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  const handleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      setIsOpen((prev) => !prev)
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const handleOptionKeyDown = (
    event: React.KeyboardEvent<HTMLLIElement>,
    lang: SupportedLanguage,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      changeLanguage(lang)
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div
      ref={containerRef}
      className={['language-switcher-dropdown', className].filter(Boolean).join(' ')}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      {/* Trigger button */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t('a11y.languageSwitcher')}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleButtonKeyDown}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          cursor: 'pointer',
          background: 'transparent',
          border: '1px solid var(--border-subtle, rgba(255,255,255,0.15))',
          borderRadius: '6px',
          color: 'inherit',
          fontSize: '13px',
        }}
      >
        <span aria-hidden="true">{activeLabel.flag}</span>
        <span>{activeLabel.nativeName}</span>
        <span aria-hidden="true" style={{ fontSize: '10px' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown list */}
      {isOpen && (
        <ul
          role="listbox"
          aria-label={t('a11y.languageSwitcher')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: '140px',
            padding: '4px 0',
            margin: 0,
            listStyle: 'none',
            background: 'var(--surface-elevated, #1e1e2e)',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.15))',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 1000,
          }}
        >
          {SUPPORTED_LANGUAGES.map((lang) => {
            const label = LANGUAGE_LABELS[lang]
            const isActive = lang === activeLanguage
            return (
              <li
                key={lang}
                role="option"
                aria-selected={isActive}
                tabIndex={0}
                onClick={() => changeLanguage(lang)}
                onKeyDown={(e) => handleOptionKeyDown(e, lang)}
                aria-label={t('a11y.switchToLanguage', { language: label.nativeName })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 400,
                  background: isActive
                    ? 'var(--accent-primary-subtle, rgba(99,102,241,0.15))'
                    : 'transparent',
                  color: 'inherit',
                  fontSize: '13px',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLElement).style.background =
                      'var(--surface-hover, rgba(255,255,255,0.05))'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                  }
                }}
              >
                <span aria-hidden="true">{label.flag}</span>
                <span>{label.nativeName}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    style={{ marginLeft: 'auto', color: 'var(--accent-primary, #6366f1)' }}
                  >
                    ✓
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default LanguageSwitcher
