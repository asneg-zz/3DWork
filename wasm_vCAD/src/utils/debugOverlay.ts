/**
 * Debug overlay for displaying logs on screen
 */

let debugElement: HTMLDivElement | null = null

export function initDebugOverlay() {
  if (debugElement) return

  debugElement = document.createElement('div')
  debugElement.id = 'debug-overlay'
  debugElement.style.cssText = `
    position: fixed;
    top: 60px;
    right: 10px;
    background: rgba(0, 0, 0, 0.8);
    color: #0f0;
    font-family: monospace;
    font-size: 11px;
    padding: 10px;
    border-radius: 4px;
    max-width: 400px;
    max-height: 500px;
    overflow-y: auto;
    z-index: 10000;
    pointer-events: none;
  `
  document.body.appendChild(debugElement)
}

export function debugLog(message: string) {
  console.log(message)

  if (!debugElement) {
    initDebugOverlay()
  }

  if (debugElement) {
    const line = document.createElement('div')
    line.textContent = message
    line.style.marginBottom = '2px'
    debugElement.appendChild(line)

    // Keep only last 30 lines
    while (debugElement.children.length > 30) {
      debugElement.removeChild(debugElement.firstChild!)
    }

    // Auto-scroll to bottom
    debugElement.scrollTop = debugElement.scrollHeight
  }
}

export function clearDebugLog() {
  if (debugElement) {
    debugElement.innerHTML = ''
  }
}
