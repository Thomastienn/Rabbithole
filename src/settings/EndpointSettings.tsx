import { useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { PlusIcon, TrashIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import type { Model } from './models';

type Endpoint = {
  id: string;
  name: string;
  baseUrl: string;
  lastTest:
    null | { ok: true; models: number; at: string } | { ok: false; error: string; at: string };
};

const when = (at: string) => {
  const d = new Date(at),
    time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? `today, ${time}`
    : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
};

// Rows rendered at once; search narrows a catalogue of hundreds.
const SHOWN = 50;

// One endpoint's models with a Reads images switch each; off sends images as OCR text.
function EndpointModels({
  endpoint,
  models,
  save,
}: {
  endpoint: Endpoint;
  models: Model[];
  save: (model: string, readsImages: boolean) => Promise<void>;
}) {
  const [query, setQuery] = useState(''),
    [saving, setSaving] = useState(''),
    [error, setError] = useState('');
  const q = query.trim().toLowerCase(),
    found = models.filter((m) => m.model.toLowerCase().includes(q)),
    shown = found.slice(0, SHOWN);
  return (
    <VStack gap={2} className="endpoint-models" as="section" aria-label={`${endpoint.name} models`}>
      <Text type="supporting" color="secondary">
        Reads images: on sends images to the model; off sends their OCR text. Starts from what the
        endpoint reports.
      </Text>
      <TextInput
        label="Search models"
        isLabelHidden
        placeholder="Search models"
        value={query}
        onChange={setQuery}
        autoComplete="off"
        hasClear
      />
      {shown.map((m) => (
        <Switch
          key={m.model}
          label={m.label}
          description="Reads images"
          value={!!m.readsImages}
          isLoading={saving === m.model}
          isDisabled={!!saving}
          onChange={async (on) => {
            setSaving(m.model);
            setError('');
            try {
              await save(m.model, on);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setSaving('');
            }
          }}
        />
      ))}
      <Text type="supporting" color="secondary" role="status">
        {!models.length
          ? 'No models listed. Test the endpoint, then try again.'
          : !found.length
            ? 'No models match.'
            : found.length > shown.length
              ? `Showing ${shown.length} of ${found.length} models. Search to narrow.`
              : `${found.length} ${found.length === 1 ? 'model' : 'models'}`}
      </Text>
      {error && (
        <Text type="supporting" role="alert">
          {error}
        </Text>
      )}
    </VStack>
  );
}

export default function EndpointSettings({
  api,
  models,
  changed,
}: {
  api: (path: string, body?: unknown) => Promise<any>;
  models?: Model[];
  changed: () => void | Promise<void>;
}) {
  const [list, setList] = useState<Endpoint[]>();
  const [adding, setAdding] = useState(false),
    [editing, setEditing] = useState<Endpoint>(),
    [removing, setRemoving] = useState<Endpoint>(),
    [browsing, setBrowsing] = useState('');
  const [name, setName] = useState(''),
    [baseUrl, setBaseUrl] = useState(''),
    [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(''),
    [pending, setPending] = useState('loading'),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function load() {
    setPending('loading');
    setError('');
    try {
      setList(await api('/api/settings/endpoints'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending('');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function act(
    action: 'add' | 'remove' | 'edit' | 'test',
    body: { id?: string; [key: string]: unknown },
    done: string,
  ) {
    if (pending) return;
    setPending(action);
    setError('');
    setMessage('');
    try {
      setList(await api(`/api/settings/endpoints${action === 'add' ? '' : `/${action}`}`, body));
      setMessage(done);
      if (action === 'add' || action === 'edit') {
        setAdding(false);
        setEditing(undefined);
        setName('');
        setBaseUrl('');
      }
      setRemoving(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApiKey('');
      setPending('');
      changed();
    }
    // Test runs after saving an edit; it lists models and sends no chat message.
    if (action === 'edit' && body.id) {
      setPending('test');
      try {
        setList(await api('/api/settings/endpoints/test', { id: body.id }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setPending('');
        changed();
      }
    }
  }
  const openAdd = () => {
    setAdding(true);
    setEditing(undefined);
    setName('');
    setBaseUrl('');
    setApiKey('');
    setError('');
    setMessage('');
  };
  const openEdit = (e: Endpoint) => {
    setEditing(e);
    setAdding(false);
    setName(e.name);
    setBaseUrl(e.baseUrl);
    setApiKey('');
    setError('');
    setMessage('');
  };
  const nameTaken = error.startsWith('Another endpoint is called');
  // Compare loosely to the saved form: the server strips trailing slashes.
  const urlChanged = !!editing && baseUrl.trim().replace(/\/+$/, '') !== editing.baseUrl;
  const keyNeeded = !editing || urlChanged;
  const form = (adding || editing) && (
    <form
      className="endpoint-form"
      aria-label={editing ? `Edit ${editing.name}` : 'New endpoint'}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && baseUrl.trim() && (apiKey.trim() || !keyNeeded))
          void (editing
            ? act(
                'edit',
                { id: editing.id, name, baseUrl, ...(apiKey && { apiKey }) },
                `${name.trim()} saved.`,
              )
            : act(
                'add',
                { name, baseUrl, apiKey },
                `${name.trim()} added. Choose its models in any model menu.`,
              ));
      }}
    >
      <VStack gap={3}>
        <Heading level={4}>{editing ? `Edit ${editing.name}` : 'New endpoint'}</Heading>
        <TextInput
          label="Name"
          description={
            editing
              ? 'Shown in model menus. Renaming keeps every conversation and profile linked.'
              : 'Shown in model menus.'
          }
          placeholder="For example, Local llama"
          value={name}
          onChange={setName}
          isReadOnly={!!pending}
          autoComplete="off"
          isRequired
          hasAutoFocus
          status={nameTaken ? { type: 'error', message: error } : undefined}
        />
        <TextInput
          label="Base URL"
          type="url"
          description="API root including its path prefix. Use HTTPS for remote endpoints."
          placeholder="http://127.0.0.1:8080/v1"
          value={baseUrl}
          onChange={setBaseUrl}
          isReadOnly={!!pending}
          autoComplete="off"
          isRequired
          status={
            urlChanged
              ? {
                  type: 'warning',
                  message:
                    'URL changed: enter the key again so it never reaches a new host unasked.',
                }
              : undefined
          }
        />
        <TextInput
          label="API key"
          type="password"
          description={
            editing && !urlChanged
              ? 'Leave empty to keep the saved key. Stored in an owner-only file on this computer; never shown.'
              : 'Stored in an owner-only file on this computer. The saved key is never shown.'
          }
          placeholder={urlChanged ? 'Required because the URL changed' : undefined}
          value={apiKey}
          onChange={setApiKey}
          isReadOnly={!!pending}
          autoComplete="new-password"
          isRequired={keyNeeded}
        />
        <HStack gap={2} wrap="wrap" vAlign="center">
          <Button
            label={pending === 'add' || pending === 'edit' ? 'Saving…' : 'Save'}
            type="submit"
            size="sm"
            isDisabled={
              !!pending || !name.trim() || !baseUrl.trim() || (keyNeeded && !apiKey.trim())
            }
          />
          <Button
            label="Cancel"
            variant="secondary"
            size="sm"
            isDisabled={!!pending}
            onClick={() => {
              setAdding(false);
              setEditing(undefined);
              setApiKey('');
              setError('');
            }}
          />
          {editing && (
            <Text type="supporting" color="secondary">
              Test runs after saving. It lists models and sends no chat message.
            </Text>
          )}
        </HStack>
      </VStack>
    </form>
  );
  return (
    <VStack gap={3} className="endpoint-settings" as="section" aria-label="Custom endpoints">
      <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
        <Heading level={3}>Custom endpoints</Heading>
        {/* Always rendered so a settings link can focus it before the list loads. */}
        <Button
          className="endpoint-add"
          label="Add endpoint"
          variant="secondary"
          size="sm"
          icon={<PlusIcon />}
          isDisabled={adding}
          onClick={openAdd}
        />
      </HStack>
      <Text type="supporting" color="secondary">
        OpenAI-compatible APIs. Each appears under its own name wherever you choose a model.
        Requests, including discussion and inherited context, go to that endpoint and are billed by
        its owner.
      </Text>
      {pending === 'loading' && (
        <Text type="supporting" role="status">
          Loading endpoints…
        </Text>
      )}
      {adding && form}
      {list?.length === 0 && !adding && (
        <EmptyState
          isCompact
          headingLevel={4}
          title="No custom endpoints yet"
          description="Add one to use a local or OpenAI-compatible model."
          actions={<Button label="Add endpoint" size="sm" icon={<PlusIcon />} onClick={openAdd} />}
        />
      )}
      {list?.map((e) =>
        editing?.id === e.id ? (
          <div key={e.id}>{form}</div>
        ) : (
          <VStack key={e.id} gap={2}>
            <HStack
              gap={2}
              vAlign="center"
              hAlign="between"
              wrap="wrap"
              className="endpoint-row"
              data-endpoint={e.id}
            >
              <VStack gap={0}>
                <Text weight="bold">{e.name}</Text>
                <Text type="supporting" color="secondary">
                  {e.baseUrl}
                </Text>
                <Text
                  type="supporting"
                  className="endpoint-test"
                  role={e.lastTest?.ok === false ? 'alert' : undefined}
                  color={e.lastTest?.ok === false ? undefined : 'secondary'}
                >
                  {pending === 'test' && testing === e.id
                    ? 'Testing…'
                    : !e.lastTest
                      ? 'Not tested'
                      : e.lastTest.ok
                        ? `${e.lastTest.models} ${e.lastTest.models === 1 ? 'model' : 'models'} listed · tested ${when(e.lastTest.at)}`
                        : `Test failed · ${e.lastTest.error} · ${when(e.lastTest.at)}`}
                </Text>
              </VStack>
              <HStack gap={1} vAlign="center">
                <Button
                  label={e.lastTest?.ok === false ? `Test ${e.name} again` : `Test ${e.name}`}
                  variant="secondary"
                  size="sm"
                  isDisabled={!!pending}
                  onClick={() => {
                    setTesting(e.id);
                    void act('test', { id: e.id }, '');
                  }}
                >
                  {e.lastTest?.ok === false ? 'Test again' : 'Test'}
                </Button>
                <Button
                  label={`${browsing === e.id ? 'Hide' : 'Show'} ${e.name} models`}
                  variant="ghost"
                  size="sm"
                  aria-expanded={browsing === e.id}
                  onClick={() => setBrowsing(browsing === e.id ? '' : e.id)}
                >
                  Models
                </Button>
                <Button
                  label={`Edit ${e.name}`}
                  variant="ghost"
                  size="sm"
                  icon={<PencilSquareIcon />}
                  isDisabled={!!pending}
                  onClick={() => openEdit(e)}
                >
                  Edit
                </Button>
                <Button
                  label={`Remove ${e.name}`}
                  variant="ghost"
                  size="sm"
                  icon={<TrashIcon />}
                  isDisabled={!!pending}
                  onClick={() => setRemoving(e)}
                >
                  Remove
                </Button>
              </HStack>
            </HStack>
            {browsing === e.id && (
              <EndpointModels
                endpoint={e}
                models={(models ?? []).filter((m) => m.provider === e.id)}
                save={async (model, readsImages) => {
                  await api('/api/settings/endpoints/model', { id: e.id, model, readsImages });
                  await changed();
                }}
              />
            )}
          </VStack>
        ),
      )}
      {message && (
        <Text type="supporting" role="status">
          {message}
        </Text>
      )}
      {error && !nameTaken && !removing && (
        <Text type="supporting" role="alert">
          {error}
        </Text>
      )}
      {!list && !pending && (
        <HStack>
          <Button
            label="Retry loading endpoints"
            variant="ghost"
            size="sm"
            onClick={() => void load()}
          />
        </HStack>
      )}
      {removing && (
        <AlertDialog
          className="endpoint-remove-dialog"
          width="min(420px, calc(100vw - 2rem))"
          isOpen
          onOpenChange={(open) => {
            if (!open && !pending) {
              setRemoving(undefined);
              setError('');
            }
          }}
          title={`Remove ${removing.name}?`}
          description={`Its saved key is deleted. Conversations and profiles that use its models keep their content, but those models show as unavailable until you choose another.${error ? ` Removal failed: ${error}` : ''}`}
          actionLabel="Remove"
          cancelLabel="Cancel"
          isActionLoading={pending === 'remove'}
          onAction={() =>
            void act(
              'remove',
              { id: removing.id },
              `${removing.name} removed. Conversations that used it keep their content.`,
            )
          }
        />
      )}
    </VStack>
  );
}
