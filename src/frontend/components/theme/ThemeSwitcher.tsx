import { Check, MonitorCog, Moon, Sun } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useTheme } from './ThemeProvider';
import type { ThemeMode } from '../../types/domain';
import { cn } from '../../lib/utils';

const items: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System', icon: MonitorCog },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

export function ThemeSwitcher() {
  const { mode, setMode } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Theme mode">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.value} onClick={() => setMode(item.value)}>
              <Icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
              {mode === item.value ? <Check className="ml-auto h-4 w-4" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeSwitcherInline() {
  const { mode, setMode } = useTheme();
  const modeLabel = mode === 'system' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-background hover:text-foreground'
          )}
          aria-label="Theme"
        >
          <span className="flex items-center gap-2">
            {mode === 'system' ? <MonitorCog className="h-4 w-4" /> : mode === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Theme
          </span>
          <span className="text-xs font-medium text-muted-foreground">: {modeLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.value} onClick={() => setMode(item.value)}>
              <Icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
              {mode === item.value ? <Check className="ml-auto h-4 w-4" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeQuickCycle() {
  const { mode, setMode } = useTheme();

  const nextMode: ThemeMode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system';
  const modeLabel = mode === 'system' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark';
  const Icon = mode === 'system' ? MonitorCog : mode === 'light' ? Sun : Moon;

  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-background hover:text-foreground"
      onClick={() => setMode(nextMode)}
      aria-label={`Theme ${modeLabel}. Tap to switch to ${nextMode}.`}
      title={`Theme: ${modeLabel} (tap to switch)`}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        Theme
      </span>
      <span className="text-xs font-medium text-muted-foreground">{modeLabel}</span>
    </button>
  );
}
