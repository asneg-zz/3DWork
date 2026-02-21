/**
 * Vitest setup file
 * Configures the test environment
 */

import { vi } from 'vitest'
import '@testing-library/jest-dom'

// Mock Three.js for tests that don't need full WebGL
vi.mock('three', async () => {
  const actual = await vi.importActual('three')
  return {
    ...actual,
    // Add any Three.js mocks here if needed
  }
})

// Mock requestAnimationFrame for tests
global.requestAnimationFrame = (callback: FrameRequestCallback) => {
  return setTimeout(() => callback(Date.now()), 16) as unknown as number
}

global.cancelAnimationFrame = (id: number) => {
  clearTimeout(id)
}
