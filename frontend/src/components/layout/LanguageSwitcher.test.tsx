/**
 * Tests for the LanguageSwitcher component.
 *
 * Uses the i18next test setup from vitest.setup.ts (which initialises i18n with
 * the real locale bundles so key resolution matches production behaviour).
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { LanguageSwitcher, LANGUAGE_STORAGE_KEY } from './LanguageSwitcher'
import enTranslations from '../../i18n/locales/en.json'
import esTranslations from '../../i18n/locales/es.json'

// ---------------------------------------------------------------------------
// Minimal i18n instance for tests — does not write to localStorage.
// ---------------------------------------------------------------------------

const testI18n = i18n.createInstance()
void testI18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: { translation: enTranslations },
    es: { translation: esTranslations },
  },
  keySeparator: false,
  interpolation: { escapeValue: false },
})

function renderSwitcher() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <LanguageSwitcher />
    </I18nextProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset to English before each test.
    void testI18n.changeLanguage('en')
  })

  it('renders the trigger button with the active language', () => {
    renderSwitcher()
    expect(screen.getByRole('button', { name: /language/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /language/i })).toHaveTextContent('English')
  })

  it('opens the dropdown when the trigger is clicked', () => {
    renderSwitcher()
    const trigger = screen.getByRole('button', { name: /language/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('shows all supported languages in the dropdown', () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /language/i }))
    const options = screen.getAllByRole('option')
    const names = options.map((o) => o.textContent)
    expect(names.some((n) => n?.includes('English'))).toBe(true)
    expect(names.some((n) => n?.includes('Español'))).toBe(true)
  })

  it('marks the active language with aria-selected="true"', () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /language/i }))
    const options = screen.getAllByRole('option')
    const activeOption = options.find((o) => o.getAttribute('aria-selected') === 'true')
    expect(activeOption).toBeTruthy()
    expect(activeOption?.textContent).toContain('English')
  })

  it('changes language and persists to localStorage on selection', () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /language/i }))
    const espanol = screen.getAllByRole('option').find((o) => o.textContent?.includes('Español'))
    expect(espanol).toBeTruthy()
    fireEvent.click(espanol!)
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es')
  })

  it('closes the dropdown after a language is selected', () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /language/i }))
    const espanol = screen.getAllByRole('option').find((o) => o.textContent?.includes('Español'))
    fireEvent.click(espanol!)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes the dropdown on Escape key', () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /language/i }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: /language/i }), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens dropdown on ArrowDown key', () => {
    renderSwitcher()
    const trigger = screen.getByRole('button', { name: /language/i })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('selects option on Enter key', () => {
    renderSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /language/i }))
    const espanol = screen.getAllByRole('option').find((o) => o.textContent?.includes('Español'))!
    fireEvent.keyDown(espanol, { key: 'Enter' })
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es')
  })
})
