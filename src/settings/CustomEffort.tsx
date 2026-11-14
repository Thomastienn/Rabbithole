import { useState } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { typedEffort } from './models';

// Inline field behind an effort picker's "Custom…" option; custom endpoint models only.
export default function CustomEffort({
  label,
  onSave,
  onCancel,
}: {
  label: string;
  onSave: (effort: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(''),
    [invalid, setInvalid] = useState(false);
  const use = () => {
    const effort = typedEffort(text);
    if (effort) onSave(effort);
    else setInvalid(true);
  };
  return (
    <HStack gap={2} className="custom-effort">
      <TextInput
        label={label}
        isLabelHidden
        size="sm"
        placeholder="Effort the endpoint accepts"
        value={text}
        onChange={(value) => {
          setText(value);
          setInvalid(false);
        }}
        onEnter={use}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        hasAutoFocus
        hasSpellCheck={false}
        status={
          invalid ? { type: 'error', message: 'Use 1–32 letters, digits, - or _.' } : undefined
        }
      />
      <Button label="Use effort" size="sm" onClick={use} />
      <Button label="Cancel" size="sm" variant="ghost" onClick={onCancel} />
    </HStack>
  );
}
