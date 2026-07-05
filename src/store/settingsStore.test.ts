import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore, tierPrefFor } from './settingsStore.ts';

beforeEach(() => {
  localStorage.removeItem('srp.settings');
  useSettingsStore.setState({ machineTiers: {} });
});

describe('settingsStore', () => {
  it('defaults every machine to prefer-v1', () => {
    const prefs = useSettingsStore.getState().machineTiers;
    expect(tierPrefFor(prefs, 'Fabricator')).toBe('prefer-v1');
    expect(tierPrefFor(prefs, 'Ore Extractor')).toBe('prefer-v1');
  });

  it('setMachineTier updates state and persists to localStorage', () => {
    useSettingsStore.getState().setMachineTier('Fabricator', 'prefer-v2');
    expect(useSettingsStore.getState().machineTiers['Fabricator']).toBe('prefer-v2');
    expect(JSON.parse(localStorage.getItem('srp.settings')!)).toEqual({
      machineTiers: { Fabricator: 'prefer-v2' },
    });
  });

  it('preferences for different machines are independent', () => {
    const s = useSettingsStore.getState();
    s.setMachineTier('Fabricator', 'only-v1');
    useSettingsStore.getState().setMachineTier('Furnace', 'prefer-v2');
    const prefs = useSettingsStore.getState().machineTiers;
    expect(tierPrefFor(prefs, 'Fabricator')).toBe('only-v1');
    expect(tierPrefFor(prefs, 'Furnace')).toBe('prefer-v2');
    expect(tierPrefFor(prefs, 'Mega Press')).toBe('prefer-v1');
  });

  it('drops invalid entries when hydrating from storage', async () => {
    localStorage.setItem(
      'srp.settings',
      JSON.stringify({ machineTiers: { Fabricator: 'bogus', Furnace: 'prefer-v2' } }),
    );
    vi.resetModules();
    const fresh = await import('./settingsStore.ts');
    const prefs = fresh.useSettingsStore.getState().machineTiers;
    expect(prefs['Fabricator']).toBeUndefined();
    expect(prefs['Furnace']).toBe('prefer-v2');
  });

  it('survives unparseable storage', async () => {
    localStorage.setItem('srp.settings', 'not json');
    vi.resetModules();
    const fresh = await import('./settingsStore.ts');
    expect(fresh.useSettingsStore.getState().machineTiers).toEqual({});
  });
});
