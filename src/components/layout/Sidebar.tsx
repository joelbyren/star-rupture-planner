import { useUiStore } from '../../store/uiStore.ts';
import { ActionsSection } from './sections/ActionsSection.tsx';
import { PersistenceSection } from './sections/PersistenceSection.tsx';
import { ValidationSection } from './sections/ValidationSection.tsx';
import { PowerSection } from './sections/PowerSection.tsx';
import { RawIntakeSection } from './sections/RawIntakeSection.tsx';
import { PortRatesSection } from './sections/PortRatesSection.tsx';

export function Sidebar() {
  const sidebarOpen = useUiStore(s => s.sidebarOpen);
  if (!sidebarOpen) return null;

  return (
    <aside className="w-64 flex-none border-r border-line-soft bg-panel overflow-y-auto">
      <ActionsSection />
      <PersistenceSection />
      <ValidationSection />
      <PowerSection />
      <RawIntakeSection />
      <PortRatesSection />
    </aside>
  );
}
