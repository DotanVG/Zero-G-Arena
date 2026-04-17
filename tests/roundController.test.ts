import { describe, expect, it, vi } from "vitest";
import { COUNTDOWN_SECONDS, ROUND_DURATION_SECONDS } from "../shared/constants";
import { RoundController } from "../client/src/game/roundController";

describe("RoundController", () => {
  it("starts the round timer only after countdown ends", () => {
    const round = new RoundController();
    const onTimeout = vi.fn();
    round.onRoundTimeout = onTimeout;

    round.startCountdown();
    round.tick(COUNTDOWN_SECONDS);

    expect(round.getPhase()).toBe("PLAYING");
    expect(round.getRoundTimeRemaining()).toBe(ROUND_DURATION_SECONDS);

    round.tick(ROUND_DURATION_SECONDS);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(round.getRoundTimeRemaining()).toBe(0);
  });

  it("resets the playing timer when a new round countdown begins", () => {
    const round = new RoundController();

    round.startCountdown();
    round.tick(COUNTDOWN_SECONDS);
    round.tick(30);
    expect(round.getRoundTimeRemaining()).toBe(ROUND_DURATION_SECONDS - 30);

    round.startCountdown();
    expect(round.getPhase()).toBe("COUNTDOWN");
    expect(round.getRoundTimeRemaining()).toBe(ROUND_DURATION_SECONDS);
  });
});
