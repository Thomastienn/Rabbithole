import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import { searchGroups } from './models';

// The search field every model picker shows; filtering is searchModels, with no debounce.
export function ModelSearch({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  return (
    <TextInput
      label="Search models"
      isLabelHidden
      placeholder="Search models"
      value={query}
      onChange={setQuery}
      autoComplete="off"
      hasClear
    />
  );
}

// Shown under a picker's rows only when the cap hides some or a search matches nothing.
export const searchNote = (shown: number, found: number, query: string) =>
  found > shown ? (
    <Text type="supporting" color="secondary" role="status">
      {`Showing ${shown} of ${found} models. Search to narrow.`}
    </Text>
  ) : found || !query.trim() ? null : (
    <Text type="supporting" color="secondary" role="status">
      No models match.
    </Text>
  );

type Option = { value: string; label: string; description?: string; disabled?: boolean };
type Section = { type: 'section'; title: string; options: Option[] };

// A settings model picker: loose rows (follow, unavailable) stay; section rows are searched.
export default function ModelPicker({
  label,
  value,
  options,
  onChange,
  isDisabled,
  isUnavailable,
}: {
  label: string;
  value: string;
  options: (Option | Section)[];
  onChange: (value: string) => void;
  isDisabled?: boolean;
  isUnavailable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const loose = options.filter((o): o is Option => !('type' in o)),
    sections = options.filter((o): o is Section => 'type' in o),
    found = searchGroups(
      sections.map((s) => s.options),
      query,
    ),
    current = [...loose, ...sections.flatMap((s) => s.options)].find((o) => o.value === value);
  const rows = (list: Option[], name: string) => (
    <DropdownMenuRadioGroup label={name} value={value} onChange={onChange}>
      {list.map((o) => (
        <DropdownMenuRadioItem
          key={o.value}
          value={o.value}
          label={o.label}
          description={o.description}
          isDisabled={o.disabled}
        />
      ))}
    </DropdownMenuRadioGroup>
  );
  return (
    <DropdownMenu
      presentation="popover"
      alignment="end"
      menuWidth="20rem"
      onOpenChange={(open) => !open && setQuery('')}
      header={<ModelSearch query={query} setQuery={setQuery} />}
      footer={searchNote(found.shown.length, found.found, query)}
      renderTrigger={(props) => (
        <Button
          {...props}
          className="model-picker-field"
          data-unavailable={isUnavailable || undefined}
          label={label}
          variant="secondary"
          size="sm"
          width="100%"
          isDisabled={isDisabled}
        >
          {current?.label ?? ''}
        </Button>
      )}
    >
      {!!loose.length && rows(loose, label)}
      {sections.map(
        (s, i) =>
          !!found.groups[i].length && (
            <DropdownMenuGroup key={s.title} title={s.title}>
              {rows(found.groups[i], `${s.title} models`)}
            </DropdownMenuGroup>
          ),
      )}
    </DropdownMenu>
  );
}
