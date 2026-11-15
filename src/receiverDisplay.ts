import type { SomeButtonGraphicsElement, ButtonGraphicsTextElement } from '@companion-module/base'
import { graphics } from 'companion-module-utils'
import type { EWDXReceiver } from './ewdxReceiver.js'
import { icons, pngDataUri } from './graphics.js'
import { formatBatteryLabel } from './statusText.js'

const triangle = (location: 'topLeft' | 'topRight'): string =>
	graphics.toPNG64({
		width: 15,
		height: 15,
		image: graphics.corner({ width: 15, height: 15, size: 15, location, color: 0x00ff00, opacity: 255 }),
	})

const antennaLeft = pngDataUri(triangle('topLeft'))
const antennaRight = pngDataUri(triangle('topRight'))

export interface ReceiverDisplayOptions {
	showLabels?: string[]
	showIcons?: string[]
	batteryAlertLevel?: number
	showRuntime?: boolean
}

export function getReceiverDisplayState(
	receiver: EWDXReceiver,
	channelIndex: number,
	options: ReceiverDisplayOptions = {},
): Record<string, string | boolean | number | undefined> {
	const channel = receiver.channels[channelIndex]
	const connected = receiver.deviceConnected && !!channel

	// Default options
	const showLabels = options.showLabels ?? ['name', 'frequency', 'battery', 'rsqi']
	const showIcons = options.showIcons ?? [
		'antenna',
		'battery',
		'mute',
		'warning',
		'encryption',
		'afPeak',
		'activeAntenna',
	]
	const batteryAlertLevel = options.batteryAlertLevel ?? 20
	const showRuntime = options.showRuntime ?? false

	const gauge = Math.max(0, Math.min(100, Number(channel?.mate.batteryGauge) || 0))

	// Battery color based on configurable alert level
	const batteryColor = !connected
		? 0x1f2937
		: gauge > batteryAlertLevel
			? 0x14532d // green
			: gauge >= Math.max(1, Math.floor(batteryAlertLevel / 2))
				? 0x713f12 // yellow
				: 0x7f1d1d // red

	// Battery label with runtime option
	let batteryLabel: string | undefined
	if (connected && showLabels.includes('battery')) {
		batteryLabel = formatBatteryLabel(channel.mate.batteryType, channel.mate.batteryLifetime, gauge, showRuntime)
	}

	const state: Record<string, string | boolean | number | undefined> = {
		connected,
	}

	// Labels
	if (showLabels.includes('name')) {
		state.name = connected ? channel.name : 'OFFLINE'
	}
	if (showLabels.includes('frequency')) {
		state.frequency = connected ? (channel.frequency / 1000).toFixed(3) : 'NO LINK'
	}
	if (showLabels.includes('battery')) {
		state.batteryLabel = batteryLabel
		state.batteryColor = batteryColor
	}
	if (showLabels.includes('rsqi')) {
		state.signal = connected ? `${channel.rsqi}%` : '—'
	}
	if (showLabels.includes('txType')) {
		state.txType = connected ? channel.mate.type : '—'
	}

	// Icons
	if (showIcons.includes('antenna')) {
		state.antenna = pngDataUri(
			connected
				? channel.rsqi > 70
					? icons.antenna.green
					: channel.rsqi > 40
						? icons.antenna.yellow
						: channel.rsqi >= 1
							? icons.antenna.red
							: icons.antenna.gray
				: icons.antenna.gray,
		)
	}
	if (showIcons.includes('encryption')) {
		state.shield = pngDataUri(
			connected && channel.hasAes256Error
				? icons.shield.red
				: connected && receiver.encryption
					? icons.shield.green
					: icons.shield.gray,
		)
	}
	if (showIcons.includes('activeAntenna')) {
		state.antennaLeft = connected && channel.activeAntenna == 1
		state.antennaRight = connected && channel.activeAntenna == 2
	}
	if (showIcons.includes('mute')) {
		state.muted = connected && (channel.mate.muted || channel.muted)
	}
	if (showIcons.includes('warning')) {
		state.warning = connected && channel.warnings
	}
	if (showIcons.includes('afPeak')) {
		state.peak = connected && channel.hasAfPeakWarning
	}

	// Always include identification for the green bar
	state.identification = connected && channel.identification

	return state
}

// Coordinates use a 72x72 reference canvas. Native layers handle device resolutions,
// proportional font rendering, clipping, and shrink-to-fit inside each text region.
export function receiverDisplayElements(): SomeButtonGraphicsElement[] {
	const pct = (pixels: number): number => (pixels / 72) * 100
	const bounds = (x: number, y: number, width: number, height: number) => ({
		x: pct(x),
		y: pct(y),
		width: pct(width),
		height: pct(height),
	})
	const state = (field: string) => ({ isExpression: true as const, value: `$(local:status).${field}` })
	const text = (
		id: string,
		field: string,
		x: number,
		y: number,
		width: number,
		height: number,
		fontSize: number,
	): ButtonGraphicsTextElement => ({
		type: 'text',
		id,
		...bounds(x, y, width, height),
		text: state(field),
		font: 'companion-sans',
		fontsize: (fontSize / height) * 100 * 1.2,
		fontsizeAllowShrink: true,
		halign: 'center',
		valign: 'center',
		color: 0xffffff,
	})
	const icon = (
		id: string,
		image: string | ReturnType<typeof state>,
		x: number,
		y: number,
		enabled?: string,
	): SomeButtonGraphicsElement => ({
		type: 'image',
		id,
		...bounds(x, y, 16, 16),
		base64Image: typeof image === 'string' ? pngDataUri(image) : image,
		fillMode: 'fit',
		...(enabled ? { enabled: state(enabled) } : {}),
	})
	return [
		{ type: 'box', id: 'background', color: 0x080b10 },
		{ type: 'box', id: 'header', ...bounds(0, 0, 72, 19), color: 0x111827 },
		{
			type: 'image',
			id: 'antenna-a',
			...bounds(0, 0, 15, 15),
			base64Image: antennaLeft,
			fillMode: 'fit',
			enabled: state('antennaLeft'),
		},
		{
			type: 'image',
			id: 'antenna-b',
			...bounds(57, 0, 15, 15),
			base64Image: antennaRight,
			fillMode: 'fit',
			enabled: state('antennaRight'),
		},
		{
			...text('antenna-a-label', 'name', 1, 0, 9, 10, 7),
			text: 'A',
			weight: 'bold',
			color: 0x000000,
			enabled: state('antennaLeft'),
		},
		{
			...text('antenna-b-label', 'name', 62, 0, 9, 10, 7),
			text: 'B',
			weight: 'bold',
			color: 0x000000,
			enabled: state('antennaRight'),
		},
		{
			type: 'box',
			id: 'battery',
			...bounds(20, 3, 30, 13),
			color: state('batteryColor'),
			borderColor: 0xffffff,
			borderWidth: pct(1),
			borderPosition: 'inside',
		},
		{ type: 'box', id: 'battery-terminal', ...bounds(50, 7.5, 3, 4), color: 0xffffff },
		text('battery-label', 'batteryLabel', 21, 4, 28, 11, 9),
		{ ...text('channel-name', 'name', 2, 21, 68, 13, 11), weight: 'bold' },
		text('frequency', 'frequency', 20, 35, 32, 12, 9),
		icon('af-peak', icons.afpeak, 54, 34, 'peak'),
		{ ...text('signal-label', 'signal', 19, 47, 34, 9, 9), color: 0xcbd5e1 },
		{ type: 'box', id: 'footer', ...bounds(0, 56, 72, 16), color: 0x111827 },
		icon('rf-quality', state('antenna'), 2, 56),
		icon('mute', icons.mute, 19, 56, 'muted'),
		icon('warning', icons.warning, 36, 56, 'warning'),
		icon('encryption', state('shield'), 54, 56),
		{ type: 'box', id: 'identification', ...bounds(0, 18, 72, 2), color: 0x00ff00, enabled: state('identification') },
	]
}
