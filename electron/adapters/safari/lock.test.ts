// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkSafariRunning } from './lock';

describe('checkSafariRunning', () => {
  it('returns a structured result with running and reason fields', () => {
    const state = checkSafariRunning();
    expect(state).toHaveProperty('running');
    if (state.running) {
      expect(typeof state.pid).toBe('number');
      expect(state.pid).toBeGreaterThan(0);
    } else {
      expect(['not-running', 'pgrep-unavailable']).toContain(state.reason);
    }
  });

  it('does not throw when pgrep is missing or Safari is absent', () => {
    expect(() => checkSafariRunning()).not.toThrow();
  });
});
