import { Modal } from './ui/Modal.tsx';
import { Button } from './ui/Button.tsx';
import {
  useSettingsStore,
  tierPrefFor,
  TIER_MACHINES,
  type TierPreference,
} from '../store/settingsStore.ts';

const PREF_OPTIONS: { value: TierPreference; label: string }[] = [
  { value: 'only-v1', label: 'Only V1' },
  { value: 'prefer-v1', label: 'Prefer V1' },
  { value: 'prefer-v2', label: 'Prefer V2' },
];

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const machineTiers = useSettingsStore(s => s.machineTiers);
  const setMachineTier = useSettingsStore(s => s.setMachineTier);

  return (
    <Modal open={open} title="Settings" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-ink-dim">
          Building versions offered when adding nodes. Existing nodes are never changed.
        </p>

        <div className="space-y-2">
          {TIER_MACHINES.map(machine => {
            const current = tierPrefFor(machineTiers, machine);
            return (
              <div key={machine} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{machine}</span>
                <div className="flex gap-0.5 border border-line-soft rounded overflow-hidden shrink-0">
                  {PREF_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setMachineTier(machine, opt.value)}
                      className={`text-[10px] font-semibold tracking-wide px-2 py-1 transition-colors ${
                        current === opt.value
                          ? 'bg-accent text-canvas'
                          : 'bg-panel-2 text-ink-mid hover:text-ink'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
