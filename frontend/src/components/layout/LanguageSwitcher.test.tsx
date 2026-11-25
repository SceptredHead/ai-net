import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../i18n'
import { LanguageSwitcher } from './LanguageSwitcher'

function renderWithI18n() {
  return render(
    <I18nextProvider i18n={i18n}>
      <LanguageSwitcher />
    </I18nextProvider>
  )
}

describe('LanguageSwitcher', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders trigger button', () => {
    renderWithI18n()
    expect(screen.getByTestId('language-switcher-trigger')).toBeInTheDocument()
  })

  it('opens dropdown on click', () => {
    renderWithI18n()
    fireEvent.click(screen.getByTestId('language-switcher-trigger'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('shows all supported languages', () => {
    renderWithI18n()
    fireEvent.click(screen.getByTestId('language-switcher-trigger'))
    expect(screen.getByTestId('language-option-en')).toBeInTheDocument()
    expect(screen.getByTestId('language-option-es')).toBeInTheDocument()
    expect(screen.getByTestId('language-option-zh')).toBeInTheDocument()
  })

  it('persists selection to localStorage under ainet_locale', async () => {
    renderWithI18n()
    fireEvent.click(screen.getByTestId('language-switcher-trigger'))
    fireEvent.click(screen.getByTestId('language-option-es'))
    expect(localStorage.getItem('ainet_locale')).toBe('es')
  })

  it('closes on Escape key', () => {
    renderWithI18n()
    fireEvent.click(screen.getByTestId('language-switcher-trigger'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByTestId('language-switcher'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('active language shows checkmark', () => {
    renderWithI18n()
    fireEvent.click(screen.getByTestId('language-switcher-trigger'))
    const activeOption = screen.getByTestId(`language-option-${i18n.resolvedLanguage ?? 'en'}`)
    expect(activeOption).toHaveAttribute('aria-checked', 'true')
  })
})
