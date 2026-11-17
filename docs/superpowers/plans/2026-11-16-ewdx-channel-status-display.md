# Sennheiser EW-DX Channel Status Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the existing EW-DX Channel Status Display to match Shure's configurability while preserving all current functionality and maintaining backward compatibility.

**Architecture:** Extend the existing native layered graphics implementation in `receiverDisplay.ts` with optional configuration for label/icon selection and battery thresholds, using the existing `receiverDisplay` value feedback and presets. No changes to device communication or subscriptions required.

**Tech Stack:** TypeScript, Companion Module SDK, companion-module-utils graphics

**Spec:** This plan implements the requirements from the user's task specification (phases A-F).

## Global Constraints

- Preserve existing `receiverDisplay` feedback ID and preset IDs (`receiver_channel_status_0` through `receiver_channel_status_3`)
- No new npm dependencies
- Use existing data model from `ewdxReceiver.ts` (RxChannel, TxMate)
- No additional polling/subscriptions - reuse existing OSC subscriptions
- Support both EM2 (2 channels) and EM4 (4 channels)
- Battery warning thresholds: green >50%, yellow >=20%, red <20% (existing, document as defaults)
- No simulated/hardcoded demo values in production code
- TypeScript build, lint, and existing tests must pass

## Review Focus

1. **Missing battery data when transmitter disconnected** - Should show "—" not "0%" or stale values
2. **RSQI = 0 vs no signal** - Must distinguish "no transmitter" (RSQI 0, gray icon) from "poor signal" (RSQI 1-40, red icon)
3. **Receiver offline state** - Entire display should show "OFFLINE" clearly, not partial stale data
4. **Audio/RF meter expectations** - Document that continuous audio/RF meters are not available from EW-DX protocol
5. **Preset backward compatibility** - Existing buttons using old presets must not break

---

### Task 1: Add Configuration Options to receiverDisplay Feedback

**Files:**

- Modify: `src/feedbacks.ts:363-371` (receiverDisplay feedback definition)
- Modify: `src/receiverDisplay.ts` (getReceiverDisplayState, receiverDisplayElements)

**Interfaces:**

- Consumes: Existing `getReceiverDisplayState(receiver, channelIndex)` returning state object
- Produces: Enhanced state object with optional fields based on configuration

- [ ] **Step 1: Write failing test for configurable feedback options**

```typescript
// tests/feedbacks.test.ts
test('receiverDisplay feedback accepts label/icon configuration options', () => {
	const feedback = feedbacks.receiverDisplay
	expect(feedback.options).toContainEqual(expect.objectContaining({ id: 'showLabels', type: 'multidropdown' }))
	expect(feedback.options).toContainEqual(expect.objectContaining({ id: 'showIcons', type: 'multidropdown' }))
	expect(feedback.options).toContainEqual(expect.objectContaining({ id: 'batteryAlertLevel', type: 'dropdown' }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test -- tests/feedbacks.test.ts`
Expected: FAIL - options not present

- [ ] **Step 3: Add configuration options to receiverDisplay feedback**

In `src/feedbacks.ts`, extend the `receiverDisplay` feedback options (around line 363-371) with:

- `showLabels`: multidropdown with choices for each label (name, frequency, battery, rsqi, txType - P2)
- `showIcons`: multidropdown with choices for each icon (antenna, battery, mute, warning, encryption, afPeak, activeAntenna)
- `batteryAlertLevel`: dropdown (20, 15, 10, 5) default 20
- `showRuntime`: boolean (show runtime vs percentage) default false

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test -- tests/feedbacks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/feedbacks.ts
git commit -m "feat: add configuration options to receiverDisplay feedback"
```

---

### Task 2: Enhance getReceiverDisplayState with Configuration

**Files:**

- Modify: `src/receiverDisplay.ts` (getReceiverDisplayState function)

**Interfaces:**

- Consumes: Configuration from feedback options, receiver data model
- Produces: State object with only enabled fields populated

- [ ] **Step 1: Write failing test for conditional field population**

```typescript
// tests/receiverDisplay.test.ts
test('getReceiverDisplayState omits disabled labels', () => {
	const state = getReceiverDisplayState(mockReceiver, 0, {
		showLabels: ['name', 'frequency'],
		showIcons: ['battery'],
	})
	expect(state.name).toBeDefined()
	expect(state.frequency).toBeDefined()
	expect(state.rsqi).toBeUndefined() // not in showLabels
	expect(state.antenna).toBeDefined() // battery icon enabled
	expect(state.muted).toBeUndefined() // mute icon not in showIcons
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test -- tests/receiverDisplay.test.ts`
Expected: FAIL - function doesn't accept config parameter

- [ ] **Step 3: Update getReceiverDisplayState to accept and apply configuration**

Modify `getReceiverDisplayState(receiver, channelIndex, options?)` to:

- Accept optional third parameter with `showLabels`, `showIcons`, `batteryAlertLevel`, `showRuntime`
- Only populate fields that are enabled in configuration
- Apply batteryAlertLevel threshold for battery color calculation
- Format battery as runtime (H:MMh) when `showRuntime` is true and data available
- Return `undefined` for disabled fields (not "—" or 0)

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test -- tests/receiverDisplay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/receiverDisplay.ts tests/receiverDisplay.test.ts
git commit -m "feat: make getReceiverDisplayState respect display configuration"
```

---

### Task 3: Update receiverDisplayElements for Dynamic Rendering

**Files:**

- Modify: `src/receiverDisplay.ts` (receiverDisplayElements function)

**Interfaces:**

- Consumes: State object from getReceiverDisplayState (with potentially undefined fields)
- Produces: Array of graphics elements that conditionally render based on state

- [ ] **Step 1: Write failing test for conditional element rendering**

```typescript
// tests/receiverDisplay.test.ts
test('receiverDisplayElements only creates elements for enabled fields', () => {
	const elements = receiverDisplayElements()
	// Should have base elements always
	const bg = elements.find((e) => e.id === 'background')
	expect(bg).toBeDefined()
	// Text elements should use state expressions
	const nameEl = elements.find((e) => e.id === 'channel-name')
	expect(nameEl?.text).toEqual({ isExpression: true, value: '$(local:status).name' })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test -- tests/receiverDisplay.test.ts`
Expected: FAIL or PASS depending on current state

- [ ] **Step 3: Update receiverDisplayElements to handle optional fields**

- Make text elements conditional: only render if field exists in state (use `enabled: state('fieldName')` pattern)
- Make icon elements conditional similarly
- Ensure layout gracefully handles missing elements (no hardcoded positions that assume all elements exist)
- Keep existing element IDs for backward compatibility

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test -- tests/receiverDisplay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/receiverDisplay.ts
git commit -m "feat: make receiverDisplayElements render conditionally"
```

---

### Task 4: Add Battery Alert Level and Runtime Display

**Files:**

- Modify: `src/receiverDisplay.ts` (getReceiverDisplayState, battery color logic)
- Modify: `src/statusText.ts` (formatBatteryLabel)

**Interfaces:**

- Consumes: `batteryAlertLevel` option, `showRuntime` option, battery gauge/lifetime/type
- Produces: Battery color based on threshold, formatted label

- [ ] **Step 1: Write failing test for battery threshold and runtime**

```typescript
// tests/statusText.test.ts
test('formatBatteryLabel returns runtime when type is Battery and lifetime > 0', () => {
	expect(formatBatteryLabel('Battery', 312, 80)).toBe('5:12h')
})

test('getReceiverDisplayState uses batteryAlertLevel for color thresholds', () => {
	const state = getReceiverDisplayState(mockReceiver, 0, { batteryAlertLevel: 15 })
	// gauge=20 should be yellow with default (20), green with alert=15
	expect(state.batteryColor).toBe(0x14532d) // green
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test -- tests/statusText.test.ts tests/receiverDisplay.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement battery alert level and runtime formatting**

- Update `formatBatteryLabel` to accept optional `showRuntime` parameter
- Update `getReceiverDisplayState` to use `batteryAlertLevel` option (default 20) for color thresholds:
  - Green: gauge > alertLevel
  - Yellow: gauge >= alertLevel/2 (or fixed >= 20)
  - Red: gauge < alertLevel/2
- When `showRuntime` true and batteryType === 'Battery' and lifetime > 0, show H:MMh format

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test -- tests/statusText.test.ts tests/receiverDisplay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/statusText.ts src/receiverDisplay.ts tests/statusText.test.ts tests/receiverDisplay.test.ts
git commit -m "feat: add battery alert level config and runtime display option"
```

---

### Task 5: Add TX Type (P2) and Document Limitations

**Files:**

- Modify: `src/receiverDisplay.ts` (getReceiverDisplayState)
- Modify: `src/feedbacks.ts` (add txType to label choices)
- Modify: `companion/HELP.md` (document unavailable features)

**Interfaces:**

- Consumes: `channel.mate.type` from data model
- Produces: TX type in state when enabled

- [ ] **Step 1: Write failing test for TX type display**

```typescript
// tests/receiverDisplay.test.ts
test('getReceiverDisplayState includes txType when enabled', () => {
	const state = getReceiverDisplayState(mockReceiver, 0, { showLabels: ['txType'] })
	expect(state.txType).toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test -- tests/receiverDisplay.test.ts`
Expected: FAIL

- [ ] **Step 3: Add TX type to available labels and state**

- Add `txType` to `showLabels` choices in feedback options
- In `getReceiverDisplayState`, include `txType: connected ? channel.mate.type : '—'` when enabled
- Add note in HELP.md that continuous audio/RF meters are not available from EW-DX protocol

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test -- tests/receiverDisplay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/feedbacks.ts src/receiverDisplay.ts companion/HELP.md
git commit -m "feat: add TX type display and document protocol limitations"
```

---

### Task 6: Verify Presets Work with Enhanced Feedback

**Files:**

- Modify: `src/presets.ts` (ensure presets pass configuration to feedback)
- Test: Manual verification via Companion UI

**Interfaces:**

- Consumes: Enhanced feedback with options
- Produces: Presets that configure the feedback with sensible defaults

- [ ] **Step 1: Update presets to include default configuration**

In `src/presets.ts`, update the `localVariables` for each preset to include default options:

```typescript
localVariables: [
	{
		variableName: 'status',
		variableType: 'feedback',
		feedbackId: 'receiverDisplay',
		options: {
			receiver: i,
			showLabels: ['name', 'frequency', 'battery', 'rsqi'],
			showIcons: ['antenna', 'battery', 'mute', 'warning', 'encryption', 'afPeak', 'activeAntenna'],
			batteryAlertLevel: 20,
			showRuntime: false,
		},
	},
]
```

- [ ] **Step 2: Build and verify**

Run: `yarn build`
Expected: PASS

- [ ] **Step 3: Lint**

Run: `yarn lint`
Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `yarn test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/presets.ts
git commit -m "feat: update presets with default display configuration"
```

---

### Task 7: Comprehensive Test Coverage for Phase E Requirements

**Files:**

- Create: `tests/channelStatusDisplay.test.ts` (comprehensive test suite)

**Interfaces:**

- Consumes: All enhanced functions
- Produces: Test coverage for all 15 test cases from spec

- [ ] **Step 1: Write tests for all 15 spec test cases**

Test cases from spec Phase E:

1. Receiver online, sender connected
2. Receiver online, sender not connected (RSQI = 0)
3. Receiver offline
4. Battery full/high
5. Battery warning (at threshold)
6. Battery critical (below threshold)
7. Battery info unavailable
8. TX muted
9. RX muted
10. RSQI high/medium/low/zero
11. Active antenna A/B
12. Warning and encryption error
13. Connected → disconnected transition
14. Disconnected → connected transition
15. Independent channel states (multi-channel)

- [ ] **Step 2: Run tests to verify they fail initially**

Run: `yarn test -- tests/channelStatusDisplay.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement tests with proper mocks**

Create mock receiver with controllable channel states for each test case.

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test -- tests/channelStatusDisplay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/channelStatusDisplay.test.ts
git commit -m "test: add comprehensive channel status display test coverage"
```

---

### Task 8: Update Documentation

**Files:**

- Modify: `companion/HELP.md`

**Interfaces:**

- Consumes: All implemented features
- Produces: Updated user-facing documentation

- [ ] **Step 1: Update HELP.md with new features**

Document:

- Channel Status Display preset usage
- Configuration options (labels, icons, battery alert, runtime)
- Icon meanings (table)
- Battery warning stages
- Supported status information
- Known limitations (no audio/RF meters, no TX lock, etc.)
- Companion version requirement (Companion 5+ for native layers)

- [ ] **Step 2: Verify documentation renders correctly**

Run: `yarn build` (includes docs check)

- [ ] **Step 3: Commit**

```bash
git add companion/HELP.md
git commit -m "docs: update HELP.md with enhanced channel status display"
```

---

### Task 9: Final Verification and Build

**Files:**

- All modified files

- [ ] **Step 1: Full build**

Run: `yarn build`
Expected: PASS

- [ ] **Step 2: Full lint**

Run: `yarn lint`
Expected: PASS

- [ ] **Step 3: Full test suite**

Run: `yarn test`
Expected: PASS

- [ ] **Step 4: Verify no regressions in existing functionality**

Check that existing presets still work, existing feedback IDs unchanged.

- [ ] **Step 5: Commit final changes**

```bash
git add -A
git commit -m "feat: complete enhanced channel status display for EW-DX"
```

---

## Execution Recommendation

**Plan complete and saved to `docs/superpowers/plans/2026-11-16-ewdx-channel-status-display.md`. Please review the plan. Which execution approach would you prefer?**

- **Subagent-driven** - A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end.

**For this plan I recommend Native, because** the tasks are tightly coupled (each builds on the previous), the codebase is small and familiar, and a single context can maintain consistency across all changes. Does the plan capture what you want, and which approach should we use?
