# Sample traces

These files are synthetic traces, not real model calls. They were copied from the
`llm-evalops` repository (`traces/synthetic/`, commit `9c45fb58a72d905bdf82b91ff63dbc28200a1093`),
which generates them with `scripts/synth_traces.py` and a fixed seed.

| File                  | Origin                                                           | Traces | Spans |
| --------------------- | ---------------------------------------------------------------- | ------ | ----- |
| `baseline.jsonl`      | first 850 traces of `traces/synthetic/baseline/spans.jsonl`      | 850    | 3,914 |
| `cheaper_model.jsonl` | first 850 traces of `traces/synthetic/cheaper_model/spans.jsonl` | 850    | 4,815 |

Only whole traces were kept (a trace is never cut in half), in original order. No line was edited.
The two files are the "before" and "after" scenarios used by the Compare view.
Model ids such as `anthropic/claude-sonnet-4.5` are data from the generator, not endorsements.

The format is the span schema described in the project README.
