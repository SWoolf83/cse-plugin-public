# Vertical Adapters

Supplemental question areas activated AFTER dream extraction. Only ask about areas that are relevant to the user's topic. Never walk through these as a checklist.

---

## Engineering Vertical

When narrowing into implementation, shape questions around RELEVANT areas only:

**ARCHITECTURE** (if feature spans multiple components):
- Where does this live? New module or extend existing?
- Client vs server boundary? Data flow between components?
- Reference scan tech: "This is a Next.js app — server component or client?"

**DATA MODEL** (if feature stores or retrieves data):
- What persists vs ephemeral? Relation to existing tables?
- Who sees this data? Privacy and permissions.
- Reference scan: "Should this extend the inquiries table or be separate?"

**API DESIGN** (if feature exposes or consumes an interface):
- What operations needed? Error handling?
- Server action, API route, or both?
- Reference scan patterns: "Your app uses server actions for mutations — same here?"

**DEPLOYMENT** (ONLY if user mentions deploy, prod, or release):
- Feature flag or direct release? Migration needed?

**TESTING** (ONLY for critical specs: auth, payments, data integrity):
- What must not break? What is the critical path?

**STACK AWARENESS:**
- If codebase scan exists: reference specific technologies, patterns, conventions.
- If no scan: ask broader questions without assuming the stack.
- Never ask "What tech stack?" when the scan already answered it.

---

## Legal Vertical

When narrowing into the legal work, shape questions around RELEVANT areas only:

**JURISDICTION** (if the work involves any specific legal system):
- Which jurisdictions apply? Federal, state, international?
- Are there conflicting jurisdictional requirements?
- Reference docket context: "Your matter is filed in the USPTO — are there parallel filings?"

**RISK TOLERANCE** (if the work involves strategic decisions):
- What level of risk is acceptable? Conservative vs aggressive?
- What is the cost of being wrong? Reversibility?
- Are there reputational or precedent-setting implications?

**DEADLINES** (if the work relates to an existing matter or filing):
- Are there statutory deadlines driving urgency?
- What extensions are available and at what cost?
- Reference docket context: "You have a response deadline in 45 days — does this relate?"

**PRIVILEGE** (ONLY if the work involves communications or document review):
- Is attorney-client privilege a concern?
- Are there work product doctrine considerations?
- Who is the audience for the final output?

**ISSUE SPOTTING** (always relevant in legal contexts):
- What legal issues does this raise beyond the obvious?
- Are there regulatory overlaps or cross-practice implications?
- What counterarguments or risks should be anticipated?

**MATTER AWARENESS:**
- If docket matters exist: reference specific matters, deadlines, examiner history.
- If no docket data: ask broader questions without assuming matter context.
- Never ask "What type of law?" when the conversation has already made it clear.

---

## Executive Vertical

When narrowing into the executive ask, shape questions around RELEVANT areas only:

**STRATEGIC INTENT** (always relevant):
- What does success look like? What changes when this is done well?
- Is this a decision you need to make, or a task you need done?
- What is the timeline? Hard deadline or aspiration?
- Reference org context: "You recently decided X — does this build on that?"

**STAKEHOLDERS** (only when delegation is likely):
- Who needs to execute this? Who has context?
- Are there dependencies on other people or teams?
- Does this need sign-off from anyone besides you?

**SUCCESS METRICS** (if the ask has measurable outcomes):
- How will you know this worked? What moves?
- Is there a quantitative target or is this qualitative?

**CONSTRAINTS** (if the ask involves resource allocation):
- Budget, timeline, or team constraints?
- What are you NOT willing to trade away?

**TIMELINE** (if the ask has urgency or scheduling concerns):
- Hard deadline or aspiration? What drives the urgency?
- Are there external dependencies gating the timeline?

**ORGANIZATIONAL MEMORY:**
- If past decisions exist: reference them naturally. "You decided X last month — does that still hold?"
- If assumptions are flagged: mention them as context. "There is an assumption that Y — worth revisiting?"
- If portfolio docs are relevant: reference specifics. "Your strategy doc mentions Z."
- If no context: ask broader questions about priorities and constraints.
- Never surface tech jargon to executives — abstract codebase context into business terms.
