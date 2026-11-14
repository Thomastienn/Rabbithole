import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import {
  CUSTOM_EFFORT,
  effortLabel,
  effortOptions,
  keptEffort,
  menuGroups,
} from '../settings/models';
import CustomEffort from '../settings/CustomEffort';
import type { SettingsTab } from '../settings/SettingsWindow';
import type { ChatModel } from './useChatModel';

// The composer's model and effort menu for the next reply.
export default function ModelMenu({
  model,
  active,
  busy,
  openSettings,
  setError,
}: {
  model: ChatModel;
  active: boolean;
  busy: boolean;
  openSettings: (section?: SettingsTab, focus?: string, opener?: HTMLElement | null) => void;
  setError: (error: string) => void;
}) {
  const { composition, modelMenuOpen, openModels, openingModels, savingModel, modelLabel } = model;
  const { providers, models, chooseModel, signIn, loadModels, currentModel } = model;
  const [typing, setTyping] = useState(false);
  if (!composition) return null;
  return (
    <>
      <DropdownMenu
        presentation="popover"
        alignment="end"
        menuWidth="16rem"
        isMenuOpen={modelMenuOpen}
        onOpenChange={(open) => void openModels(open)}
        renderTrigger={(props) => (
          <Button
            {...props}
            className="model-picker"
            label="Model for next reply"
            tooltip={
              active
                ? 'Wait for this reply to finish before changing models'
                : openingModels
                  ? 'Loading models'
                  : savingModel
                    ? 'Saving model selection'
                    : `Model for next reply: ${modelLabel(composition)} · ${effortLabel(composition.effort)}`
            }
            icon={<AdjustmentsHorizontalIcon />}
            variant="ghost"
            size="sm"
            isDisabled={active || !!savingModel || openingModels || busy}
            isLoading={openingModels || !!savingModel}
          >
            <span className="chat-model">
              {modelLabel(composition)} · {effortLabel(composition.effort)}
            </span>
          </Button>
        )}
      >
        {menuGroups(providers ?? {}, models, composition).map((g) => {
          const { id } = g;
          return (
            <DropdownMenuGroup key={id} title={g.title}>
              {g.items ? (
                <DropdownMenuRadioGroup
                  label={`${g.label} models`}
                  value={g.value}
                  onChange={(model) =>
                    void chooseModel(
                      id,
                      model,
                      keptEffort(
                        composition.effort,
                        models?.find((m) => m.provider === id && m.model === model),
                      ),
                    )
                  }
                >
                  {g.items.map((m) => (
                    <DropdownMenuRadioItem
                      key={m.value}
                      value={m.value}
                      label={m.label}
                      isDisabled={m.disabled}
                    />
                  ))}
                </DropdownMenuRadioGroup>
              ) : g.action === 'endpoint' ? (
                <DropdownMenuItem
                  label="Custom endpoint settings"
                  description="Add an endpoint or check its URL, API key and connection"
                  onClick={() =>
                    openSettings(
                      'connections',
                      '.endpoint-add',
                      document.querySelector<HTMLElement>('[aria-label="Model for next reply"]'),
                    )
                  }
                />
              ) : g.action === 'codex' ? (
                <DropdownMenuItem
                  label="Continue with ChatGPT"
                  description="Sign in to use Codex with your ChatGPT plan"
                  onClick={() => void signIn().catch((e) => setError(e.message))}
                />
              ) : (
                <DropdownMenuItem
                  label={`Check ${g.label} sign-in`}
                  description={
                    id === 'claude'
                      ? 'Run claude in a terminal and sign in, then check again'
                      : 'Sign in, then check again'
                  }
                  onClick={() => void loadModels()}
                />
              )}
            </DropdownMenuGroup>
          );
        })}
        <DropdownMenuGroup title="Effort for next reply">
          <DropdownMenuRadioGroup
            label="Conversation effort"
            value={composition.effort ?? 'default'}
            onChange={(value) => {
              if (value === CUSTOM_EFFORT) setTyping(true);
              else if (currentModel)
                void chooseModel(
                  composition.provider,
                  currentModel.model,
                  value === 'default' ? null : value,
                );
            }}
          >
            {effortOptions(composition.effort, currentModel).map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                label={option.label}
                isDisabled={option.disabled || (option.value === 'default' && !currentModel)}
              />
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenu>
      {typing && currentModel && (
        <CustomEffort
          label="Custom effort for next reply"
          onCancel={() => setTyping(false)}
          onSave={(effort) => {
            setTyping(false);
            void chooseModel(composition.provider, currentModel.model, effort);
          }}
        />
      )}
    </>
  );
}
