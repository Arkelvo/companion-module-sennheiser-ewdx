import { describe, it, expect, vi } from 'vitest'

vi.mock('@companion-module/base', () => ({
	combineRgb: (r: number, g: number, b: number) => (r << 16) | (g << 8) | b,
	InstanceStatus: { Ok: 0, Disconnected: 1, ConnectionFailure: 2 },
}))

vi.mock('companion-module-utils', () => ({
	graphics: {
		toPNG64: () => 'mocked',
		corner: () => new Uint8Array(),
		parseBase64: () => Promise.resolve(new Uint8Array()),
	},
}))

vi.mock('../src/graphics.js', () => ({
	icons: {
		antenna: { red: 'ant_red', yellow: 'ant_yellow', green: 'ant_green', gray: 'ant_gray' },
		shield: { green: 'sh_green', red: 'sh_red', gray: 'sh_gray' },
		mute: 'mute_icon',
		warning: 'warn_icon',
		afpeak: 'afpeak_icon',
		temperature: '',
		overcurrent: '',
		communicationError: '',
		chargeError: '',
		disconnected: '',
	},
	images: {
		antenna: { red: new Uint8Array(), yellow: new Uint8Array(), green: new Uint8Array(), gray: new Uint8Array() },
		shield: { green: new Uint8Array(), red: new Uint8Array(), gray: new Uint8Array() },
		mute: new Uint8Array(),
		warning: new Uint8Array(),
		afpeak: new Uint8Array(),
		temperature: new Uint8Array(),
		overcurrent: new Uint8Array(),
		communicationError: new Uint8Array(),
		chargeError: new Uint8Array(),
		disconnected: new Uint8Array(),
	},
	pngDataUri: (s: string) => `data:image/png;base64,${s}`,
}))

vi.mock('../src/statusText.js', () => ({
	formatBatteryLabel: (type: string, lifetime: number, gauge: number, showRuntime?: boolean) => {
		const minutes = Math.floor(Number(lifetime))
		if (showRuntime && type === 'Battery' && Number.isFinite(minutes) && minutes > 0) {
			return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}h`
		}
		return `${Math.round(Math.max(0, Math.min(100, Number(gauge) || 0)))}%`
	},
}))

describe('Channel Status Display - Phase E Test Cases', () => {
	let getReceiverDisplayState: any

	beforeEach(async () => {
		vi.resetModules()
		const mod = await import('../src/receiverDisplay.js')
		getReceiverDisplayState = mod.getReceiverDisplayState
	})

	// Helper to create a mock receiver with customizable channels
	const createMockReceiver = (overrides: Partial<{
		deviceConnected: boolean
		encryption: boolean
		channels: any[]
	}> = {}) => ({
		deviceConnected: true,
		encryption: false,
		channels: [
			{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: {
					batteryGauge: 80,
					batteryType: 'Battery',
					batteryLifetime: 300,
					muted: false,
					type: 'SKM',
				},
			},
			{
				name: 'CH2',
				frequency: 520000,
				rsqi: 0,
				activeAntenna: 0,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: {
					batteryGauge: 0,
					batteryType: 'UNKNOWN',
					batteryLifetime: 0,
					muted: false,
					type: 'UNKNOWN',
				},
			},
		],
		...overrides,
	})

	// Test Case 1: Receiver online, Sender connected
	it('Test 1: Receiver online, sender connected', () => {
		const receiver = createMockReceiver()
		const state = getReceiverDisplayState(receiver, 0)

		expect(state.connected).toBe(true)
		expect(state.name).toBe('CH1')
		expect(state.frequency).toBe('518.000')
		expect(state.signal).toBe('85%')
		expect(state.batteryLabel).toBeDefined()
		expect(state.muted).toBe(false)
		expect(state.warning).toBe(false)
	})

	// Test Case 2: Receiver online, Sender not connected (RSQI = 0)
	it('Test 2: Receiver online, sender not connected (RSQI = 0)', () => {
		const receiver = createMockReceiver()
		// Channel 2 has rsqi = 0
		const state = getReceiverDisplayState(receiver, 1)

		expect(state.connected).toBe(true)
		expect(state.name).toBe('CH2')
		expect(state.signal).toBe('0%')
		expect(state.antenna).toContain('ant_gray')
		expect(state.muted).toBe(false)
		expect(state.warning).toBe(false)
	})

	// Test Case 3: Receiver offline
	it('Test 3: Receiver offline', () => {
		const receiver = createMockReceiver({ deviceConnected: false })
		const state = getReceiverDisplayState(receiver, 0)

		expect(state.connected).toBe(false)
		expect(state.name).toBe('OFFLINE')
		expect(state.frequency).toBe('NO LINK')
	})

	// Test Case 4: Battery fully charged / high
	it('Test 4: Battery fully charged / high (> 50%)', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: {
					batteryGauge: 100,
					batteryType: 'Battery',
					batteryLifetime: 480,
					muted: false,
					type: 'SKM',
				},
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { batteryAlertLevel: 20 })

		expect(state.batteryColor).toBe(0x14532d) // green
	})

	// Test Case 5: Battery in warning area (at threshold)
	it('Test 5: Battery in warning area (at threshold)', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: {
					batteryGauge: 20,
					batteryType: 'Battery',
					batteryLifetime: 60,
					muted: false,
					type: 'SKM',
				},
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { batteryAlertLevel: 20 })

		// gauge = 20, alertLevel = 20 -> yellow (gauge >= alertLevel/2 = 10)
		expect(state.batteryColor).toBe(0x713f12) // yellow
	})

	// Test Case 6: Battery critical (below threshold)
	it('Test 6: Battery critical (below threshold)', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: {
					batteryGauge: 9,
					batteryType: 'Battery',
					batteryLifetime: 15,
					muted: false,
					type: 'SKM',
				},
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { batteryAlertLevel: 20 })

		// gauge = 9, alertLevel = 20 -> red (gauge < alertLevel/2 = 10)
		expect(state.batteryColor).toBe(0x7f1d1d) // red
	})

	// Test Case 7: Battery information not available
	it('Test 7: Battery information not available', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: {
					batteryGauge: 0,
					batteryType: 'UNKNOWN',
					batteryLifetime: 0,
					muted: false,
					type: 'UNKNOWN',
				},
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { showLabels: ['battery'] })

		expect(state.batteryLabel).toBe('0%')
		expect(state.batteryColor).toBe(0x7f1d1d) // red (0 < 10)
	})

	// Test Case 8: Transmitter muted
	it('Test 8: Transmitter muted', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: {
					batteryGauge: 80,
					batteryType: 'Battery',
					batteryLifetime: 300,
					muted: true, // TX muted
					type: 'SKM',
				},
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { showIcons: ['mute'] })

		expect(state.muted).toBe(true)
	})

	// Test Case 9: Receiver muted
	it('Test 9: Receiver muted', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: true, // RX muted
				mate: {
					batteryGauge: 80,
					batteryType: 'Battery',
					batteryLifetime: 300,
					muted: false,
					type: 'SKM',
				},
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { showIcons: ['mute'] })

		expect(state.muted).toBe(true)
	})

	// Test Case 10: RSQI high, medium, low, and zero
	it('Test 10a: RSQI high (> 70%)', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: { batteryGauge: 80, batteryType: 'Battery', batteryLifetime: 300, muted: false, type: 'SKM' },
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { showIcons: ['antenna'] })
		expect(state.antenna).toContain('ant_green')
	})

	it('Test 10b: RSQI medium (> 40%)', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 55,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: { batteryGauge: 80, batteryType: 'Battery', batteryLifetime: 300, muted: false, type: 'SKM' },
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { showIcons: ['antenna'] })
		expect(state.antenna).toContain('ant_yellow')
	})

	it('Test 10c: RSQI low (>= 1%)', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 25,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: { batteryGauge: 80, batteryType: 'Battery', batteryLifetime: 300, muted: false, type: 'SKM' },
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { showIcons: ['antenna'] })
		expect(state.antenna).toContain('ant_red')
	})

	it('Test 10d: RSQI zero (0%)', () => {
		const receiver = createMockReceiver()
		const state = getReceiverDisplayState(receiver, 1, { showIcons: ['antenna'] }) // channel 2 has rsqi 0
		expect(state.antenna).toContain('ant_gray')
	})

	// Test Case 11: Active antenna A and B
	it('Test 11a: Active antenna A', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: { batteryGauge: 80, batteryType: 'Battery', batteryLifetime: 300, muted: false, type: 'SKM' },
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { showIcons: ['activeAntenna'] })
		expect(state.antennaLeft).toBe(true)
		expect(state.antennaRight).toBe(false)
	})

	it('Test 11b: Active antenna B', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 2,
				warnings: false,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: { batteryGauge: 80, batteryType: 'Battery', batteryLifetime: 300, muted: false, type: 'SKM' },
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { showIcons: ['activeAntenna'] })
		expect(state.antennaLeft).toBe(false)
		expect(state.antennaRight).toBe(true)
	})

	// Test Case 12: Warning and encryption error
	it('Test 12a: Warning present', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: true,
				hasAfPeakWarning: false,
				hasAes256Error: false,
				identification: false,
				muted: false,
				mate: { batteryGauge: 80, batteryType: 'Battery', batteryLifetime: 300, muted: false, type: 'SKM' },
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { showIcons: ['warning'] })
		expect(state.warning).toBe(true)
	})

	it('Test 12b: Encryption error (AES256)', () => {
		const receiver = createMockReceiver({
			channels: [{
				name: 'CH1',
				frequency: 518000,
				rsqi: 85,
				activeAntenna: 1,
				warnings: true,
				hasAfPeakWarning: false,
				hasAes256Error: true,
				identification: false,
				muted: false,
				mate: { batteryGauge: 80, batteryType: 'Battery', batteryLifetime: 300, muted: false, type: 'SKM' },
			}],
		})
		const state = getReceiverDisplayState(receiver, 0, { showIcons: ['encryption'] })
		expect(state.shield).toContain('sh_red')
	})

	// Test Case 13: Transition from connected to disconnected
	it('Test 13: Transition from connected to disconnected', () => {
		const connectedReceiver = createMockReceiver()
		const connectedState = getReceiverDisplayState(connectedReceiver, 0)
		expect(connectedState.connected).toBe(true)
		expect(connectedState.name).toBe('CH1')

		const disconnectedReceiver = createMockReceiver({ deviceConnected: false })
		const disconnectedState = getReceiverDisplayState(disconnectedReceiver, 0)
		expect(disconnectedState.connected).toBe(false)
		expect(disconnectedState.name).toBe('OFFLINE')
	})

	// Test Case 14: Restoration of connection
	it('Test 14: Restoration of connection', () => {
		const disconnectedReceiver = createMockReceiver({ deviceConnected: false })
		const disconnectedState = getReceiverDisplayState(disconnectedReceiver, 0)
		expect(disconnectedState.connected).toBe(false)

		const connectedReceiver = createMockReceiver()
		const connectedState = getReceiverDisplayState(connectedReceiver, 0)
		expect(connectedState.connected).toBe(true)
		expect(connectedState.name).toBe('CH1')
	})

	// Test Case 15: Independent channel states at multiple channels
	it('Test 15: Independent channel states at multiple channels', () => {
		const receiver = createMockReceiver({
			channels: [
				{
					name: 'CH1',
					frequency: 518000,
					rsqi: 85,
					activeAntenna: 1,
					warnings: false,
					hasAfPeakWarning: false,
					hasAes256Error: false,
					identification: false,
					muted: false,
					mate: { batteryGauge: 80, batteryType: 'Battery', batteryLifetime: 300, muted: false, type: 'SKM' },
				},
				{
					name: 'CH2',
					frequency: 520000,
					rsqi: 45,
					activeAntenna: 2,
					warnings: true,
					hasAfPeakWarning: true,
					hasAes256Error: false,
					identification: false,
					muted: true,
					mate: { batteryGauge: 15, batteryType: 'Battery', batteryLifetime: 90, muted: true, type: 'SKP' },
				},
			],
		})

		const stateCh1 = getReceiverDisplayState(receiver, 0)
		const stateCh2 = getReceiverDisplayState(receiver, 1)

		// Channel 1: good signal, no warnings, not muted, high battery
		expect(stateCh1.name).toBe('CH1')
		expect(stateCh1.signal).toBe('85%')
		expect(stateCh1.antennaLeft).toBe(true)
		expect(stateCh1.warning).toBe(false)
		expect(stateCh1.muted).toBe(false)
		expect(stateCh1.batteryColor).toBe(0x14532d) // green (80 > 20)

		// Channel 2: medium signal, warnings, AF peak, muted, medium battery (yellow)
		expect(stateCh2.name).toBe('CH2')
		expect(stateCh2.signal).toBe('45%')
		expect(stateCh2.antennaRight).toBe(true)
		expect(stateCh2.warning).toBe(true)
		expect(stateCh2.peak).toBe(true)
		expect(stateCh2.muted).toBe(true)
		expect(stateCh2.batteryColor).toBe(0x713f12) // yellow (15 >= 10, but 15 <= 20)
	})
})