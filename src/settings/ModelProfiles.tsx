import { useEffect, useState, type ReactNode } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  DropdownMenu,
  DropdownMenuDivider,
  DropdownMenuItem,
} from '@astryxdesign/core/DropdownMenu';
import {
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  PlusIcon,
  RectangleStackIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import type { Model, ChatSelection } from './models';

type Pin = Pick<Model, 'provider' | 'model'> | null;
type Profile = {
  id: string;
  name: string;
  chat: ChatSelection;
  smart: { model: Pin };
  quick: { model: Pin };
};

// Profile picker above the role table; swapping remounts the role rows so each reloads from the newly active profile.
export default function ModelProfiles({
  api,
  models,
  providers,
  modelError,
  reloadModels,
  connections,
  version,
  onActivated,
  children,
}: {
  api: (path: string, body?: unknown) => Promise<any>;
  models?: Model[];
  providers?: Record<string, { label: string; connected: boolean }>;
  modelError: string;
  reloadModels: () => Promise<void>;
  connections: () => void;
  version: number;
  onActivated: (chat: ChatSelection) => void;
  children: ReactNode;
}) {
  const [list, setList] = useState<{ active: string; profiles: Profile[] }>();
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [refreshing, setRefreshing] = useState(false);
  // Naming state: the picker becomes a name field for a new profile or a rename of the active one.
  const [naming, setNaming] = useState<{ mode: 'new' | 'rename'; name: string }>();
  async function run(
    task: Promise<{ active: string; profiles: Profile[] }>,
    then?: (list: {
      active: string;
      profiles: Profile[];
    }) => Promise<{ active: string; profiles: Profile[] }>,
  ) {
    setPending(true);
    setError('');
    try {
      const next = await task;
      setList(then ? await then(next) : next);
      setNaming(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  // New and Duplicate switch to the created profile (always listed last) so the next edits land in it.
  const activateNewest = (next: { active: string; profiles: Profile[] }) =>
    activate(next.profiles.at(-1)!.id);
  // The open conversation follows the newly active profile's chat model.
  const activate = async (id: string) => {
    const next: { active: string; profiles: Profile[] } = await api('/api/profiles/active', { id });
    onActivated(next.profiles.find((p) => p.id === next.active)!.chat);
    return next;
  };
  async function refresh() {
    setRefreshing(true);
    try {
      await reloadModels();
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    void run(api('/api/profiles'));
  }, [version]);
  useEffect(() => {
    void refresh();
  }, []);
  const name = (pin: ChatSelection | Pin) => {
    if (!pin) return '';
    const m = models?.find(
      (m) =>
        providers?.[m.provider]?.connected &&
        m.provider === pin.provider &&
        (pin.model ? m.model === pin.model : m.isDefault),
    );
    return m
      ? m.label
      : `${providers?.[pin.provider]?.label ?? pin.provider} ${pin.model ?? 'default model'}${models ? ' (unavailable)' : ''}`;
  };
  const summary = (p: Profile) =>
    [
      name(p.chat),
      p.smart.model ? name(p.smart.model) : 'follows chat',
      p.quick.model ? name(p.quick.model) : 'default quick thinking',
    ].join(' · ');
  const active = list?.profiles.find((p) => p.id === list.active);
  function save() {
    const name = naming?.name.trim();
    if (!name || !list || pending) return;
    if (naming!.mode === 'rename') void run(api(`/api/profiles/${list.active}/rename`, { name }));
    else void run(api('/api/profiles', { name }), activateNewest);
  }
  function cancel() {
    setNaming(undefined);
    setError('');
  }
  return (
    <VStack gap={4}>
      <HStack className="settings-profile" gap={3} vAlign="center" wrap="wrap">
        {naming ? (
          <HStack gap={2} vAlign="center">
            <TextInput
              label="Profile name"
              isLabelHidden
              size="sm"
              value={naming.name}
              onChange={(name) => setNaming({ ...naming, name })}
              isReadOnly={pending}
              autoComplete="off"
              hasAutoFocus
              onEnter={() => save()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  cancel();
                }
              }}
            />
            <Button
              label="Save"
              size="sm"
              variant="primary"
              isDisabled={!naming.name.trim() || pending}
              isLoading={pending}
              onClick={() => save()}
            />
            <Button label="Cancel" size="sm" isDisabled={pending} onClick={cancel} />
          </HStack>
        ) : (
          <Selector
            label="Model profile"
            isLabelHidden
            value={list?.active ?? ''}
            size="sm"
            isDisabled={!list || pending}
            options={(list?.profiles ?? []).map((p) => ({
              value: p.id,
              label: p.name,
              description: summary(p),
            }))}
            onChange={(id) => {
              if (id !== list?.active) void run(activate(id));
            }}
          />
        )}
        <Text className="settings-profile__note" type="supporting" color="secondary">
          New learning trees, visuals and suggestions use this profile. Conversations you already
          started keep their model.
        </Text>
        {list && !naming && (
          <HStack gap={1}>
            <IconButton
              label="New profile"
              tooltip="New profile"
              icon={<PlusIcon />}
              variant="ghost"
              size="sm"
              isDisabled={pending}
              onClick={() => {
                setError('');
                setNaming({ mode: 'new', name: '' });
              }}
            />
            {active && (
              <DropdownMenu
                presentation="popover"
                alignment="end"
                renderTrigger={(props) => (
                  <IconButton
                    {...props}
                    label="Profile actions: rename, duplicate, delete"
                    tooltip="Profile actions"
                    icon={<EllipsisHorizontalIcon />}
                    variant="ghost"
                    size="sm"
                    isDisabled={pending}
                  />
                )}
              >
                <DropdownMenuItem
                  icon={PencilSquareIcon}
                  label="Rename"
                  onClick={() => {
                    setError('');
                    setNaming({ mode: 'rename', name: active?.name ?? '' });
                  }}
                />
                <DropdownMenuItem
                  icon={RectangleStackIcon}
                  label="Duplicate"
                  onClick={() =>
                    void run(api(`/api/profiles/${list.active}/duplicate`, {}), activateNewest)
                  }
                />
                <DropdownMenuDivider />
                <DropdownMenuItem
                  icon={TrashIcon}
                  label={`Delete ${active?.name ?? 'profile'}`}
                  description={list.profiles.length < 2 ? 'Keep at least one profile' : undefined}
                  isDisabled={list.profiles.length < 2}
                  onClick={() => void run(api(`/api/profiles/${list.active}/delete`, {}))}
                />
              </DropdownMenu>
            )}
          </HStack>
        )}
      </HStack>
      {error && (
        <Text type="supporting" role="alert">
          {error}
        </Text>
      )}
      {!list && !pending && (
        <HStack>
          <Button
            label="Retry loading profiles"
            size="sm"
            variant="ghost"
            onClick={() => void run(api('/api/profiles'))}
          />
        </HStack>
      )}
      {list && (
        <div
          role="table"
          aria-label={`Roles in ${active?.name ?? 'profile'}`}
          className="settings-roles"
          key={list.active}
        >
          <div role="row" className="settings-roles__row">
            <span role="columnheader">Role</span>
            <span role="columnheader">Model</span>
            <span role="columnheader">Effort</span>
          </div>
          {children}
        </div>
      )}
      <Text type="supporting" color="secondary">
        Changes save into {active?.name ?? 'the active profile'}. Provider default leaves effort to
        the provider.
      </Text>
      <HStack gap={2} wrap="wrap">
        <Button
          label="Refresh models"
          size="sm"
          variant="ghost"
          isDisabled={refreshing}
          isLoading={refreshing}
          onClick={() => void refresh()}
        />
        <Button label="Manage connections" size="sm" variant="ghost" onClick={connections} />
      </HStack>
      {!refreshing && models && !models.some((m) => providers?.[m.provider]?.connected) && (
        <Text type="supporting">
          No models available. Sign in or configure a custom endpoint under Connections, then
          refresh models.
        </Text>
      )}
      {modelError && (
        <Text type="supporting" role="alert">
          {modelError}
        </Text>
      )}
    </VStack>
  );
}
