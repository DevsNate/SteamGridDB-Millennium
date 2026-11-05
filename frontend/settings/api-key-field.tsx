// The Personal API Key field, shared by the settings panel and the artwork page's setup view.
import { Focusable, TextField } from '@decky/ui';
import { useRef } from 'react';
import type { ComponentProps, ComponentType } from 'react';

const PasswordField = TextField as ComponentType<ComponentProps<typeof TextField> & { type: 'password'; autoComplete: 'off' }>;

export const ApiKeyField = ({ value, onChange, disabled }: { value: string; onChange(value: string): void; disabled: boolean }) => {
  const root = useRef<HTMLDivElement>(null);
  return (
    // The wrapper takes D-pad focus; A then opens the field and Steam's keyboard.
    <Focusable ref={root} focusWithinClassName="sgdb-key-focus" onActivate={() => {
      if (disabled) return;
      const input = root.current?.querySelector('input');
      input?.focus();
      input?.click();
    }}>
      <PasswordField label="Personal API Key" type="password" autoComplete="off" value={value}
        disabled={disabled} onChange={event => onChange(event.target.value)} />
    </Focusable>
  );
};
