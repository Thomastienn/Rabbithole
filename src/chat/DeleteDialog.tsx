import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { deletePrompt } from '../map/treeList';
import type { TreeActions } from './useTreeActions';

export default function DeleteDialog({
    deletion,
    deleting,
    deleteError,
    cancelDelete,
    deleteConversation,
}: Pick<
    TreeActions,
    'deletion' | 'deleting' | 'deleteError' | 'cancelDelete' | 'deleteConversation'
>) {
    return (
        <AlertDialog
            className="delete-dialog"
            width="min(420px, calc(100vw - 2rem))"
            data-failed={!!deleteError}
            isOpen={!!deletion}
            onOpenChange={(open) => {
                if (!open) cancelDelete();
            }}
            {...deletePrompt(deletion, deleteError)}
            cancelLabel="Keep conversations"
            isActionLoading={deleting}
            onAction={() => void deleteConversation()}
        />
    );
}
