export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
}

const STYLE_ID = "ob-confirm-dialog-style";
const CSS = `
  .ob-confirm-overlay {
    position: fixed;
    inset: 0;
    z-index: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background:
      radial-gradient(circle at top, rgba(16, 36, 54, 0.74), rgba(3, 8, 14, 0.92) 56%, rgba(2, 4, 7, 0.98)),
      linear-gradient(180deg, rgba(0, 0, 0, 0.34), rgba(0, 0, 0, 0.6));
    color: #effcff;
    font-family: "Cormorant Garamond", serif;
  }
  .ob-confirm-card {
    width: min(420px, 92vw);
    padding: 28px 30px 24px;
    border: 1px solid rgba(127, 252, 255, 0.32);
    background: rgba(4, 9, 14, 0.94);
    box-shadow: 0 0 0 1px rgba(127, 252, 255, 0.06) inset, 0 24px 48px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(16px);
  }
  .ob-confirm-title {
    margin: 0 0 12px;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #7ffcff;
  }
  .ob-confirm-body {
    margin: 0 0 22px;
    font-size: 18px;
    line-height: 1.4;
    color: #dffcff;
  }
  .ob-confirm-buttons {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  .ob-confirm-btn {
    min-height: 38px;
    padding: 0 18px;
    border: 1px solid rgba(127, 252, 255, 0.32);
    background: rgba(7, 15, 28, 0.86);
    color: #effcff;
    cursor: pointer;
    font-family: "JetBrains Mono", monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
  }
  .ob-confirm-btn:hover {
    border-color: rgba(127, 252, 255, 0.6);
    background: rgba(12, 26, 42, 0.95);
  }
  .ob-confirm-btn--danger {
    border-color: rgba(255, 120, 150, 0.5);
    color: #ffd1dc;
  }
  .ob-confirm-btn--danger:hover {
    border-color: rgba(255, 120, 150, 0.85);
    background: rgba(40, 10, 18, 0.92);
    color: #ffe6ec;
  }
`;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

let activeOverlay: HTMLDivElement | null = null;

export function showConfirmDialog(opts: ConfirmOptions): Promise<boolean> {
  injectStyle();

  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }

  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "ob-confirm-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "ob-confirm-card";

    const title = document.createElement("h2");
    title.className = "ob-confirm-title";
    title.textContent = opts.title;

    const body = document.createElement("p");
    body.className = "ob-confirm-body";
    body.textContent = opts.body;

    const buttons = document.createElement("div");
    buttons.className = "ob-confirm-buttons";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "ob-confirm-btn";
    cancelBtn.textContent = opts.cancelLabel;

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "ob-confirm-btn ob-confirm-btn--danger";
    confirmBtn.textContent = opts.confirmLabel;

    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(buttons);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    const close = (result: boolean): void => {
      document.removeEventListener("keydown", onKey, true);
      if (activeOverlay === overlay) activeOverlay = null;
      overlay.remove();
      resolve(result);
    };

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(false);
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("keydown", onKey, true);

    cancelBtn.addEventListener("click", () => close(false));
    confirmBtn.addEventListener("click", () => close(true));

    confirmBtn.focus();
  });
}
