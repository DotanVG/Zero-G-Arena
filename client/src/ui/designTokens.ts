let injected = false;

export function injectDesignTokens(): void {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'ob-design-tokens';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300&family=JetBrains+Mono:wght@300;400;500&display=swap');

    :root {
      --ob-ink-0: #070a12;
      --ob-ink-1: #0b1120;
      --ob-ink-2: #121a2b;
      --ob-line:   rgba(210, 220, 240, 0.08);
      --ob-line-2: rgba(210, 220, 240, 0.16);
      --ob-fg:        #e8ecf4;
      --ob-fg-dim:    #9aa5b8;
      --ob-fg-faint:  #57637a;
      --ob-cyan:         oklch(0.82 0.15 210);
      --ob-magenta:      oklch(0.72 0.25 330);
      --ob-cyan-soft:    oklch(0.82 0.15 210 / 0.18);
      --ob-magenta-soft: oklch(0.72 0.25 330 / 0.22);
      --ob-serif: "Cormorant Garamond", "Times New Roman", serif;
      --ob-mono:  "JetBrains Mono", ui-monospace, monospace;
    }
  `;
  document.head.appendChild(style);
}
