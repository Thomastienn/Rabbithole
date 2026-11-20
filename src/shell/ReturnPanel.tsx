import { HStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

// A full-page tab (Knowledge, Videos, Pieces) with a button back to the learning tree.
export default function ReturnPanel({
  label,
  returnId,
  shown,
  overview,
  back,
  children,
}: {
  label: string;
  returnId: string;
  shown: boolean;
  overview: boolean;
  back: () => void;
  children: React.ReactNode;
}) {
  return (
    <main hidden={!shown} className="knowledge-panel" aria-label={label}>
      {shown && (
        <>
          <HStack padding={3} className="knowledge-header">
            <Button
              id={returnId}
              label="Return to learning tree"
              variant="ghost"
              icon={<ArrowLeftIcon />}
              onClick={() => {
                back();
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>(
                      overview ? '.map-toolbar button' : '#rename-conversation',
                    )
                    ?.focus(),
                );
              }}
            />
          </HStack>
          {children}
        </>
      )}
    </main>
  );
}
