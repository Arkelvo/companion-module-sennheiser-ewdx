import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the companion module base
vi.mock('@companion-module/base', () => ({
	combineRgb: (r: number, g: number, b: number) => (r << 16) | (g << 8) | b,
	InstanceStatus: { Ok: 0, Disconnected: 1, ConnectionFailure: 2 },
}))

vi.mock('companion-module-utils', () => ({
	graphics: {
		toPNG64: () => 'mocked',
		corner: () => new Uint8Array(),
		parseBase64: async () => Promise.resolve(new Uint8Array()),
	},
}))

// Mock the internal modules
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

describe('getReceiverDisplayState', () => {
	let getReceiverDisplayState: any

	beforeEach(async () => {
		vi.resetModules()
		const mod = await import('../src/receiverDisplay.js')
		getReceiverDisplayState = mod.getReceiverDisplayState
	})

	const mockReceiver = {
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
	}

	it('returns all default fields when no options provided', () => {
		const state = getReceiverDisplayState(mockReceiver, 0)
		expect(state.connected).toBe(true)
		expect(state.name).toBe('CH1')
		expect(state.frequency).toBe('518.000')
		expect(state.batteryLabel).toBeDefined()
		expect(state.batteryColor).toBeDefined()
		expect(state.signal).toBe('85%')
		expect(state.antenna).toBeDefined()
		expect(state.shield).toBeDefined()
		expect(state.antennaLeft).toBe(true)
		expect(state.antennaRight).toBe(false)
		expect(state.muted).toBe(false)
		expect(state.warning).toBe(false)
		expect(state.peak).toBe(false)
		expect(state.identification).toBe(false)
	})

	it('omits labels not in showLabels', () => {
		const state = getReceiverDisplayState(mockReceiver, 0, { showLabels: ['name', 'frequency'] })
		expect(state.name).toBe('CH1')
		expect(state.frequency).toBe('518.000')
		expect(state.batteryLabel).toBeUndefined()
		expect(state.signal).toBeUndefined()
		expect(state.txType).toBeUndefined()
	})

	it('includes txType when enabled', () => {
		const state = getReceiverDisplayState(mockReceiver, 0, { showLabels: ['txType'] })
		expect(state.txType).toBe('SKM')
	})

	it('omits icons not in showIcons', () => {
		const state = getReceiverDisplayState(mockReceiver, 0, { showIcons: ['battery', 'mute'] })
		expect(state.antenna).toBeUndefined()
		expect(state.shield).toBeUndefined()
		expect(state.antennaLeft).toBeUndefined()
		expect(state.antennaRight).toBeUndefined()
		expect(state.muted).toBe(false)
		expect(state.warning).toBeUndefined()
		expect(state.peak).toBeUndefined()
	})

	it('uses batteryAlertLevel for color thresholds', () => {
		// gauge = 80, default alertLevel = 20 -> green (>20)
		const stateDefault = getReceiverDisplayState(mockReceiver, 0, { batteryAlertLevel: 20 })
		expect(stateDefault.batteryColor).toBe(0x14532d) // green

		// gauge = 80, alertLevel = 85 -> yellow (>= 42)
		const stateHighAlert = getReceiverDisplayState(mockReceiver, 0, { batteryAlertLevel: 85 })
		expect(stateHighAlert.batteryColor).toBe(0x713f12) // yellow

		// gauge = 9, alertLevel = 20 -> red (< 10)
		const lowBatteryReceiver = {
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
						batteryGauge: 9,
						batteryType: 'Battery',
						batteryLifetime: 300,
						muted: false,
						type: 'SKM',
					},
				},
			],
		}
		const stateLowBattery = getReceiverDisplayState(lowBatteryReceiver, 0, { batteryAlertLevel: 20 })
		expect(stateLowBattery.batteryColor).toBe(0x7f1d1d) // red
	})

	it('shows runtime format when showRuntime is true', () => {
		const state = getReceiverDisplayState(mockReceiver, 0, { showRuntime: true, showLabels: ['battery'] })
		expect(state.batteryLabel).toBe('5:00h')
	})

	it('shows percentage format when showRuntime is false', () => {
		const state = getReceiverDisplayState(mockReceiver, 0, { showRuntime: false, showLabels: ['battery'] })
		expect(state.batteryLabel).toBe('80%')
	})

	it('returns OFFLINE when receiver not connected', () => {
		const offlineReceiver = { ...mockReceiver, deviceConnected: false }
		const state = getReceiverDisplayState(offlineReceiver, 0)
		expect(state.connected).toBe(false)
		expect(state.name).toBe('OFFLINE')
		expect(state.frequency).toBe('NO LINK')
		expect(state.batteryLabel).toBeUndefined() // not in default showLabels for disconnected
	})

	it('returns NO LINK when channel has rsqi 0', () => {
		const state = getReceiverDisplayState(mockReceiver, 1) // channel 2 has rsqi 0
		expect(state.connected).toBe(true) // receiver connected but no link
		expect(state.name).toBe('CH2')
		expect(state.signal).toBe('0%')
		expect(state.antenna).toContain('ant_gray') // gray antenna for rsqi 0
	})

	it('includes txType when enabled in showLabels', () => {
		const state = getReceiverDisplayState(mockReceiver, 0, { showLabels: ['txType'] })
		expect(state.txType).toBe('SKM')
	})

	it('omits txType when not in showLabels', () => {
		const state = getReceiverDisplayState(mockReceiver, 0, { showLabels: ['name'] })
		expect(state.txType).toBeUndefined()
	})
})
