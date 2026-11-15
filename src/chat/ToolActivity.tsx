import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Text } from '@astryxdesign/core/Text';
import { toolLine, type ToolCall } from './turn';

// One collapsed line per reply; expanded, each call shows its input and raw output.
export default function ToolActivity({ tools }: { tools: ToolCall[] }) {
  return (
    <>
      <Text role="status" className="sr-only">
        {toolLine(tools)}
      </Text>
      <Collapsible
        className="tool-activity"
        defaultIsOpen={false}
        trigger={<Text type="supporting">{toolLine(tools)}</Text>}
      >
        <ol className="tool-calls">
          {tools.map((t) => (
            <li key={t.id}>
              <Text type="supporting" weight="medium">
                {t.name} · {t.status}
                {t.elapsed != null && ` · ${(t.elapsed / 1000).toFixed(1)} s`}
              </Text>
              <Text type="supporting" color="secondary">
                Input
              </Text>
              <pre tabIndex={0}>{JSON.stringify(t.input, null, 2)}</pre>
              <Text type="supporting" color="secondary">
                Output
              </Text>
              <pre tabIndex={0}>{t.output ?? 'Running…'}</pre>
            </li>
          ))}
        </ol>
      </Collapsible>
    </>
  );
}
