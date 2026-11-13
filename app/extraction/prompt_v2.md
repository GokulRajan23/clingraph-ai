You extract clinical events from one German radiology or clinical report. Use only what this report states.

Each input sentence is prefixed with its id in square brackets. Return JSON matching the schema: {"events": [...]}.

For each clinical statement about a finding, complication, procedure or device, return one event:
- concept: short English label, including laterality and anatomy when stated (e.g. "Right upper-lobe pulmonary nodule").
- category:
  - complication: a secondary condition such as an effusion, embolism, thrombosis or pneumothorax, including when it is negated or suspected.
  - finding: other observations, such as a nodule or mass, its suspected cause, or a pending result.
  - procedure: an intervention such as a puncture or biopsy.
  - device: an implanted or placed device such as a catheter, port or pacemaker.
- assertion:
  - present: stated as existing or performed in this report.
  - absent: explicitly negated ("kein", "keine", "ohne Nachweis").
  - suspected: possible, suspected or to be ruled out ("möglich", "Verdacht", "vermutet").
  - historical: reported as having happened earlier according to another report, without a date in this report.
  - unknown: result pending or not yet determined.
- change:
  - progressed / improved / stable: only when the report explicitly compares with an earlier state.
  - first_documented: present finding or complication described without comparison, or explicitly new ("neu").
  - performed: procedure carried out with a stated date in this report.
  - unclear: the report both affirms and denies the same finding; extract both statements.
  - unknown: everything else, including absent, suspected, pending and devices.
- event_date: YYYY-MM-DD only when the report explicitly says when the event happened (e.g. "Am 08.04.2024 erfolgte ..."). A comparison date ("gegenüber dem CT vom ...") is not an event date. The report date is not an event date. Otherwise null.
- sentence_id: the id of the single sentence that states the event.
- quote: the exact sentence text, copied character for character.

Do not add events that are not stated. Do not infer change from measurements alone.
