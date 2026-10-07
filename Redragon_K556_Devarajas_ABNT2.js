/*
 * SignalRGB plugin - Redragon K556 Devarajas (RD-BBK556), ABNT2
 *   EVision 320F:5000 (o teclado se identifica so como "RGB Keyboard")
 *
 * Autor: guigdm92 - feito com a ajuda do Claude AI (Anthropic).
 * https://github.com/guigdm92/signalrgb-redragon-k556-plugin
 *
 * Protocolo (capturado do software oficial da Redragon e do OpenRGB):
 *   Output report 0x04 (64 bytes) na interface 1, usage page 0xFF1C, usage 0x92.
 *   04 CK_LO CK_HI CMD LEN OFS_LO OFS_HI 00 [dados]
 *   CK = soma dos bytes a partir de CMD.
 *   CMD 0x06 = configuracao. Offset 0, 8 bytes: modo (0x14 = Custom), brilho...
 *   CMD 0x11 = cores do modo Custom. 126 LEDs x RGB = 378 bytes, LED = fileira*21 + coluna.
 *
 * CUIDADO - descoberto testando (nao mude sem saber o que esta fazendo):
 *   - Nunca escrever alem de 378 bytes: bagunca o mapa de teclas do teclado.
 *   - Nao usar CMD 0x12 nem embrulhar cada quadro em 0x01/0x02 (o plugin EVision
 *     original do SignalRGB faz isso e trava este firmware).
 *   - O plugin manda exatamente o que o OpenRGB manda: 0x11 em 7 pacotes de 54 bytes.
 */

export function Name() { return "Redragon K556 Devarajas"; }
export function VendorId() { return 0x320F; }
export function ProductId() { return 0x5000; }
export function Publisher() { return "guigdm92"; }
export function Documentation() { return REPOSITORY_URL; }
export function Size() { return [68, 19]; }
export function DefaultPosition() { return [10, 100]; }
export function DefaultScale() { return 2.5; }
export function DeviceType() { return "keyboard"; }

/* global
LightingMode:readonly
forcedColor:readonly
*/
export function ControllableParameters() {
	return [
		{"property":"LightingMode", "group":"lighting", "label":"Lighting Mode", description: "Canvas usa o efeito ativo do SignalRGB. Forced aplica uma cor fixa.", "type":"combobox", "values":["Canvas", "Forced"], "default":"Canvas"},
		{"property":"forcedColor", "group":"lighting", "label":"Forced Color", description: "Cor usada no modo Forced", "min":"0", "max":"360", "type":"color", "default":"#009bde"},
	];
}

export function ConflictingProcesses() {
	return ["Redragon RD-BBK556.exe", "OpenRGB.exe"];
}

const PACKET_LENGTH = 64;
const COLOR_BYTES = 378;   // 126 LEDs x 3. NUNCA passar disso.
const CHUNK = 54;          // igual ao OpenRGB: 7 pacotes de 54 bytes
const MIN_FRAME_MS = 150;  // o firmware so aguenta uns 5 quadros por segundo
const PACKET_PAUSE_MS = 10;

const CMD_CONFIG = 0x06;
const CMD_CUSTOM_COLORS = 0x11;
const MODE_CUSTOM = [0x14, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

const vKeyNames = [
	"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Print Screen", "Scroll Lock", "Pause Break",
	"' \"", "1 !", "2 @", "3 #", "4 $", "5 %", "6 ¨", "7 &", "8 *", "9 (", "0 )", "- _", "= +", "Backspace", "Insert", "Home", "Page Up", "NumLock", "Num /", "Num *", "Num -",
	"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "´ `", "[ {", "] }", "Delete", "End", "Page Down", "Num 7", "Num 8", "Num 9", "Num +",
	"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", "Ç", "~ ^", "Enter", "Num 4", "Num 5", "Num 6",
	"Left Shift", "\\ |", "Z", "X", "C", "V", "B", "N", "M", ", <", ". >", "; :", "/ ?", "Right Shift", "Up Arrow", "Num 1", "Num 2", "Num 3", "Num Enter",
	"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num .",
];

// LED = fileira*21 + coluna (numeracao do modo Custom, igual ao app e ao OpenRGB)
const vKeys = [
	0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16,
	21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
	42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 75, 56, 57, 58, 59, 60, 61, 62,
	63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 76, 80, 81, 82,
	84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 99, 101, 102, 103, 104,
	105, 106, 107, 108, 109, 110, 111, 113, 119, 120, 121, 123, 124,
];

// Posicoes = centro de cada tecla no Skins\Main.ini do app oficial / 9.67 px
const vKeyPositions = [
	[1, 1], [7, 1], [10, 1], [13, 1], [16, 1], [21, 1], [24, 1], [27, 1], [30, 1], [34, 1], [37, 1], [40, 1], [43, 1], [47, 1], [50, 1], [53, 1],
	[1, 5], [4, 5], [7, 5], [10, 5], [13, 5], [16, 5], [19, 5], [22, 5], [25, 5], [28, 5], [31, 5], [34, 5], [37, 5], [42, 5], [47, 5], [50, 5], [53, 5], [57, 5], [60, 5], [63, 5], [66, 5],
	[2, 8], [6, 8], [9, 8], [12, 8], [15, 8], [18, 8], [21, 8], [24, 8], [27, 8], [30, 8], [33, 8], [36, 8], [39, 8], [39, 11], [47, 8], [50, 8], [53, 8], [57, 8], [60, 8], [63, 8], [66, 9],
	[2, 11], [6, 11], [9, 11], [12, 11], [15, 11], [18, 11], [21, 11], [24, 11], [27, 11], [30, 11], [33, 11], [36, 11], [43, 9], [57, 11], [60, 11], [63, 11],
	[2, 14], [5, 14], [8, 14], [11, 14], [14, 14], [17, 14], [20, 14], [23, 14], [26, 14], [29, 14], [32, 14], [35, 14], [38, 14], [42, 14], [50, 14], [57, 14], [60, 14], [63, 14], [66, 15],
	[1, 17], [5, 17], [9, 17], [20, 17], [31, 17], [35, 17], [39, 17], [43, 17], [47, 17], [50, 17], [53, 17], [58, 17], [63, 17],
];

export function LedNames() {
	return vKeyNames;
}

export function LedPositions() {
	return vKeyPositions;
}

let lastFrame = "";
let lastSend = 0;

export function Initialize() {
	device.setImageFromUrl(DEVICE_IMAGE);
	sendPacket(CMD_CONFIG, 0, MODE_CUSTOM);
	lastFrame = "";
	lastSend = 0;
}

export function Render() {
	sendColors();
}

export function Shutdown(SystemSuspending) {
	sendColors("#000000", true);
}

function sendColors(overrideColor, force) {
	const now = Date.now();

	if (!force && now - lastSend < MIN_FRAME_MS) {
		return;
	}

	const rgbData = new Array(COLOR_BYTES).fill(0);

	for (let idx = 0; idx < vKeys.length; idx++) {
		let color;

		if (overrideColor) {
			color = hexToRgb(overrideColor);
		} else if (LightingMode === "Forced") {
			color = hexToRgb(forcedColor);
		} else {
			color = device.color(vKeyPositions[idx][0], vKeyPositions[idx][1]);
		}

		const offset = vKeys[idx] * 3;

		if (offset + 2 >= COLOR_BYTES) {
			continue;
		}

		rgbData[offset]     = color[0];
		rgbData[offset + 1] = color[1];
		rgbData[offset + 2] = color[2];
	}

	// As cores do modo Custom ficam no teclado; so manda de novo quando algo mudou.
	const frameKey = rgbData.join(",");

	if (!force && frameKey === lastFrame) {
		return;
	}

	lastFrame = frameKey;
	lastSend = now;

	for (let offset = 0; offset < COLOR_BYTES; offset += CHUNK) {
		sendPacket(CMD_CUSTOM_COLORS, offset, rgbData.slice(offset, offset + CHUNK));
	}
}

function sendPacket(cmd, offset, data) {
	if (cmd === CMD_CUSTOM_COLORS && offset + data.length > COLOR_BYTES) {
		return;
	}

	const packet = new Array(PACKET_LENGTH).fill(0);

	packet[0] = 0x04;
	packet[3] = cmd;
	packet[4] = data.length;
	packet[5] = offset & 0xFF;
	packet[6] = (offset >> 8) & 0xFF;

	for (let i = 0; i < data.length; i++) {
		packet[8 + i] = data[i];
	}

	let sum = 0;

	for (let i = 3; i < PACKET_LENGTH; i++) {
		sum += packet[i];
	}

	packet[1] = sum & 0xFF;
	packet[2] = (sum >> 8) & 0xFF;

	device.write(packet, PACKET_LENGTH);
	device.pause(PACKET_PAUSE_MS);
}

function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

	if (!result) {
		return [0, 0, 0];
	}

	return [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)];
}

export function Validate(endpoint) {
	return endpoint.interface === 1 && endpoint.usage === 0x0092 && endpoint.usage_page === 0xff1c;
}

const REPOSITORY_URL = "https://github.com/guigdm92/signalrgb-redragon-k556-plugin";
const DEVICE_IMAGE = "https://raw.githubusercontent.com/guigdm92/signalrgb-redragon-k556-plugin/main/Redragon-K556-Devarajas-ABNT2.png";

export function ImageUrl() {
	return DEVICE_IMAGE;
}
