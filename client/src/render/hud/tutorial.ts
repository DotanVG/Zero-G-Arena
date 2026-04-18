import type { PlayerPhase } from "../../../../shared/schema";

export const FIRST_TIME_TUTORIAL_STORAGE_KEY = "orbital_first_flight_tutorial_v1";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface TutorialContext {
  currentBreachTeam: 0 | 1;
  frozen: boolean;
  inRound: boolean;
  mobile: boolean;
  phase: PlayerPhase;
  team: 0 | 1;
}

export interface TutorialPrompt {
  body: string;
  progress: string;
  title: string;
}

type TutorialStep = {
  desktopBody: string;
  mobileBody: string;
  title: string;
};

const STEPS: TutorialStep[] = [
  {
    title: "Grab a bar",
    desktopBody: "Drift onto a rail and press [E] to lock in before you launch.",
    mobileBody: "Drift onto a rail and tap GRAB to lock in before you launch.",
  },
  {
    title: "Launch into zero-G",
    desktopBody: "Hold [SPACE], pull down to charge, then release to slingshot.",
    mobileBody: "Hold LAUNCH, drag down to charge, then release to slingshot.",
  },
  {
    title: "Fire a freeze shot",
    desktopBody: "Click to fire. A frozen enemy stays stranded for the round.",
    mobileBody: "Tap FIRE to shoot. A frozen enemy stays stranded for the round.",
  },
  {
    title: "Breach to score",
    desktopBody: "Float through the enemy portal to win the point for your team.",
    mobileBody: "Drift through the enemy portal to win the point for your team.",
  },
];

export class FirstTimeTutorial {
  private active = false;
  private attachedLastFrame = false;
  private shotFired = false;
  private stepIndex = 0;

  public constructor(private storage: StorageLike = resolveStorage()) {}

  public forceRestart(): void {
    this.storage.setItem(FIRST_TIME_TUTORIAL_STORAGE_KEY, "");
    this.active = true;
    this.stepIndex = 0;
    this.attachedLastFrame = false;
    this.shotFired = false;
  }

  public beginRun(): void {
    if (this.isCompleted()) {
      this.active = false;
      return;
    }

    if (!this.active) {
      this.active = true;
      this.stepIndex = 0;
    }

    this.attachedLastFrame = false;
    this.shotFired = false;
  }

  public noteShotFired(): void {
    if (!this.active) return;
    this.shotFired = true;
  }

  public update(context: TutorialContext): TutorialPrompt | null {
    if (!this.active) return null;

    this.advance(context);

    const attachedNow = isAttachedToBar(context.phase);
    this.attachedLastFrame = attachedNow;

    if (!this.active || !context.inRound || context.frozen) {
      return null;
    }

    const step = STEPS[this.stepIndex];
    if (!step) return null;

    return {
      progress: `FIRST FLIGHT ${this.stepIndex + 1}/${STEPS.length}`,
      title: step.title,
      body: context.mobile ? step.mobileBody : step.desktopBody,
    };
  }

  private advance(context: TutorialContext): void {
    while (this.active && this.stepIndex < STEPS.length) {
      if (!this.isCurrentStepComplete(context)) {
        break;
      }

      if (this.stepIndex === 2) {
        this.shotFired = false;
      }

      this.stepIndex += 1;
    }

    if (this.stepIndex >= STEPS.length) {
      this.complete();
    }
  }

  private complete(): void {
    this.active = false;
    this.storage.setItem(FIRST_TIME_TUTORIAL_STORAGE_KEY, "done");
  }

  private isCompleted(): boolean {
    return this.storage.getItem(FIRST_TIME_TUTORIAL_STORAGE_KEY) === "done";
  }

  private isCurrentStepComplete(context: TutorialContext): boolean {
    switch (this.stepIndex) {
      case 0:
        return isAttachedToBar(context.phase);
      case 1:
        return this.attachedLastFrame && context.phase === "FLOATING";
      case 2:
        return this.shotFired;
      case 3:
        return context.phase === "BREACH" && context.currentBreachTeam !== context.team;
      default:
        return false;
    }
  }
}

function isAttachedToBar(phase: PlayerPhase): boolean {
  return phase === "GRABBING" || phase === "AIMING";
}

function resolveStorage(): StorageLike {
  const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (storage) return storage;

  const fallback = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return fallback.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      fallback.set(key, value);
    },
  };
}
