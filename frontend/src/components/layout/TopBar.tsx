interface TopBarProps {
  title: string;
  subtitle?: string;
}

export default function TopBar({ title, subtitle }: TopBarProps) {
  const today = new Date().toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <header className="flex justify-between items-center w-full px-xl py-lg sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-outline-variant">
      <div className="flex flex-col">
        <h2 className="text-headline-lg font-bold text-on-surface">{title}</h2>
        {subtitle && (
          <div className="flex items-center gap-sm mt-xs text-on-surface-variant text-label-md">
            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
            <span>{today}</span>
            <span className="mx-xs">•</span>
            <span className="material-symbols-outlined text-[16px]">location_on</span>
            <span>Hyderabad</span>
          </div>
        )}
        {!subtitle && (
          <div className="flex items-center gap-sm mt-xs text-on-surface-variant text-label-md">
            <span>{today}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-md">
        <button className="p-sm rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <button className="p-sm rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors">
          <span className="material-symbols-outlined">translate</span>
        </button>
        <div className="w-10 h-10 rounded-full border-2 border-primary bg-primary-container flex items-center justify-center">
          <span className="text-on-primary text-label-md font-bold">SC</span>
        </div>
      </div>
    </header>
  );
}
