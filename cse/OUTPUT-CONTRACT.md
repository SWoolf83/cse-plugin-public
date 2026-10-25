# Output contract — what a human gets back

How every CSE skill talks to the person using it. Not a style preference: the
shape of the output decides whether a human can act on it or has to re-read it.

This governs **agent → human** text only. Instruction files that only a model
reads (SKILL.md bodies, subagent prompts) are a different register and are not
bound by this.

## The rule

**Never end a report with a question the human has to answer in prose.**

A decision goes to `AskUserQuestion` with 2-4 concrete options. A report that
finishes with "want me to do X, or Y?" has pushed the work of structuring the
choice back onto the person who asked you to do the work.

## Six checks

Apply these to anything you send a human.

1. **A choice is options, never a sentence.** If the next step depends on the
   human, call `AskUserQuestion`. Lead with the one you recommend and say why in
   one line. "Let me know how you want to proceed" is not a choice, it is a
   request for the human to invent one.

2. **Lead with the answer.** First line says what is true or what you did.
   Reasoning comes after, and only as far as it changes what they would do.
   A reader who stops after the first line should still have the answer.

3. **Branches go in a table or a list, never a paragraph.** When output presents
   options, findings, or states, the reader is scanning for the one row that
   matches them. A paragraph makes them read all of it to find out.

4. **One idea per paragraph, four sentences maximum.** A longer block is two
   ideas that have not been separated yet.

5. **Define a compressed term on first use, or do not use it.** Internal
   vocabulary (`frontier`, `scar`, `held branch`, `abstention`, `must-have
   truth`) is model-facing shorthand. In human-facing output either spend the
   words to define it or say the plain thing.

6. **Say what is open in one line each, and only if the human can act on it.**
   Caveats the reader cannot do anything about are noise. If it is genuinely
   blocking, it is a decision — see check 1.

## Done when

The output passes if all of these hold. Each is checkable by reading it, without
knowing the skill's internals:

- [ ] Every choice offered to the human arrived as `AskUserQuestion` options, not
      as prose ending in a question mark.
- [ ] The first line states the answer or the outcome.
- [ ] No paragraph runs past four sentences.
- [ ] Every list of options, findings, or states is a list or a table.
- [ ] No internal term appears undefined on first use.
- [ ] Every open item is one line, and each names something the human can decide
      or ignore on purpose.

## The failure this exists to stop

A correct report the human has to read twice to act on. Length is not the fault
and shortness is not the fix: a four-line answer that buries the decision in the
fourth line fails the same way a forty-line one does. The test is whether the
person can act **without re-reading**.

Reported in practice, 2026-08-21: four consecutive turns of multi-paragraph
prose closing with "want me to do A or B?" The content was accurate every time.
The user's verdict was that the structured, multiple-choice CSE flow produced a
better working conversation than the prose did, and they were right.
