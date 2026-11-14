import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { currentQuestion } from './turn';

const short = (text: string) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 80 ? `${t.slice(0, 79)}…` : t;
};

// One tick per learner question on the focused chat's right edge; the question nearest the reading area top is current.
export default function TurnRail({
  questions,
  jump,
}: {
  questions: { id: string; text: string }[];
  jump: (id: string) => void;
}) {
  const rail = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState<string>();
  useEffect(() => {
    const chat = rail.current?.parentElement;
    if (!chat) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const first = chat.querySelector<HTMLElement>('[data-chat-message]');
      let scroller = first?.parentElement;
      while (
        scroller &&
        scroller !== chat &&
        !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
      )
        scroller = scroller.parentElement;
      if (!scroller) return;
      const box = scroller.getBoundingClientRect(),
        line = box.top + box.height / 3;
      setCurrent(
        currentQuestion(
          questions,
          (id) =>
            chat.querySelector(`[data-chat-message="${CSS.escape(id)}"]`)?.getBoundingClientRect()
              .top,
          line,
        ),
      );
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };
    schedule();
    chat.addEventListener('scroll', schedule, true);
    addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      chat.removeEventListener('scroll', schedule, true);
      removeEventListener('resize', schedule);
    };
  }, [questions]);
  return (
    <nav ref={rail} className="turn-rail" aria-label="Questions in this conversation">
      {questions.map((q) => (
        <Tooltip key={q.id} content={short(q.text)} placement="start">
          <Button
            className="turn-tick"
            label={short(q.text)}
            aria-current={q.id === current || undefined}
            variant="ghost"
            size="sm"
            onClick={() => jump(q.id)}
          >
            <span aria-hidden />
          </Button>
        </Tooltip>
      ))}
    </nav>
  );
}
