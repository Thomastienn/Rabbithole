import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import {
    DropdownMenu,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import { AdjustmentsHorizontalIcon, PhotoIcon } from '@heroicons/react/24/outline';
import {
    CUSTOM_EFFORT,
    effortLabel,
    effortOptions,
    keptEffort,
    menuGroups,
    searchGroups,
} from '../settings/models';
import { ModelSearch, searchNote } from '../settings/ModelPicker';
import CustomEffort from '../settings/CustomEffort';
import type { SettingsTab } from '../settings/SettingsWindow';
import type { ChatModel } from './useChatModel';

// The composer's model menu and, beside it, the effort menu for the next reply.
export default function ModelMenu({
    composition,
    modelMenuOpen,
    openModels,
    openingModels,
    savingModel,
    modelLabel,
    providers,
    models,
    chooseModel,
    signIn,
    loadModels,
    currentModel,
    active,
    busy,
    openSettings,
    setError,
}: Pick<
    ChatModel,
    | 'composition'
    | 'modelMenuOpen'
    | 'openModels'
    | 'openingModels'
    | 'savingModel'
    | 'modelLabel'
    | 'providers'
    | 'models'
    | 'chooseModel'
    | 'signIn'
    | 'loadModels'
    | 'currentModel'
> & {
    active: boolean;
    busy: boolean;
    openSettings: (section?: SettingsTab, focus?: string, opener?: HTMLElement | null) => void;
    setError: (error: string) => void;
}) {
    const [typing, setTyping] = useState(false),
        [query, setQuery] = useState('');
    if (!composition) return null;
    const groups = menuGroups(providers ?? {}, models, composition),
        found = searchGroups(
            groups.map((g) => g.items ?? []),
            query,
        );
    return (
        <>
            <DropdownMenu
                presentation="popover"
                alignment="end"
                menuWidth="16rem"
                isMenuOpen={modelMenuOpen}
                onOpenChange={(open) => {
                    if (!open) setQuery('');
                    void openModels(open);
                }}
                header={<ModelSearch query={query} setQuery={setQuery} />}
                footer={searchNote(found.shown.length, found.found, query)}
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
                                    : `Model for next reply: ${modelLabel(composition)}`
                        }
                        icon={<AdjustmentsHorizontalIcon />}
                        variant="ghost"
                        size="sm"
                        isDisabled={active || !!savingModel || openingModels || busy}
                        isLoading={openingModels || !!savingModel}
                    >
                        <span className="chat-model">{modelLabel(composition)}</span>
                    </Button>
                )}
            >
                {groups.map((g, i) => {
                    const { id } = g,
                        items = g.items && found.groups[i];
                    // A search hides providers without matches, including their sign-in actions.
                    if (query.trim() && !items?.length) return null;
                    return (
                        <DropdownMenuGroup key={id} title={g.title}>
                            {items ? (
                                <DropdownMenuRadioGroup
                                    label={`${g.label} models`}
                                    value={g.value}
                                    onChange={(model) =>
                                        void chooseModel(
                                            id,
                                            model,
                                            keptEffort(
                                                composition.effort,
                                                models?.find(
                                                    (m) => m.provider === id && m.model === model,
                                                ),
                                            ),
                                        )
                                    }
                                >
                                    {items.map((m) => (
                                        <DropdownMenuRadioItem
                                            key={m.value}
                                            value={m.value}
                                            label={m.label}
                                            isDisabled={m.disabled}
                                            endContent={
                                                m.readsImages ? (
                                                    <PhotoIcon
                                                        className="model-reads-images"
                                                        role="img"
                                                        aria-hidden={false}
                                                        aria-label="Reads images"
                                                        title="Reads images"
                                                        width={16}
                                                        height={16}
                                                    />
                                                ) : undefined
                                            }
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
                                            document.querySelector<HTMLElement>(
                                                '[aria-label="Model for next reply"]',
                                            ),
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
            </DropdownMenu>
            <DropdownMenu
                presentation="popover"
                alignment="end"
                renderTrigger={(props) => (
                    <Button
                        {...props}
                        className="model-picker"
                        label="Effort for next reply"
                        tooltip={
                            active
                                ? 'Wait for this reply to finish before changing effort'
                                : `Effort for next reply: ${effortLabel(composition.effort)}`
                        }
                        variant="ghost"
                        size="sm"
                        isDisabled={active || !!savingModel || busy || !currentModel}
                    >
                        <span className="chat-model">{effortLabel(composition.effort)}</span>
                    </Button>
                )}
            >
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
                            isDisabled={
                                option.disabled || (option.value === 'default' && !currentModel)
                            }
                        />
                    ))}
                </DropdownMenuRadioGroup>
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
