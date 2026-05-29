// SPDX-License-Identifier: MIT
// from https://github.com/recrof/map.meshcore.dev/blob/main/src/node-utils.js
// Modified to add TypeScript types and support targets earlier than ES2020.

function fnv1aHash(str: string): number {
	let hash = BigInt(0x811c9dc5);
	for (let i = 0; i < str.length; i++) {
		hash = BigInt.asIntN(32, hash ^ BigInt(str.charCodeAt(i)));
		hash = BigInt.asIntN(32, hash * BigInt(0x01000193));
	}

	return Number(hash & BigInt(0xFFFFFFFF));
}

export function getColourForName(name: string, saturation: number = 60, lightness: number = 50): string {
	const hash = fnv1aHash(name);

	return `hsl(${hash % 360}deg, ${saturation}%, ${lightness}%)`;
}

export function getNameIconLabel(name: string): string {
	if (name.length === 0) {
		return ''
	}

	const match = name.match(/\p{Emoji_Presentation}/u);
	if (!match) {
		name = name.trim();
		const segments = name.split(' ');
		if (segments.length == 1) {
			return name.charAt(0);
		}
		const firstSegment = segments.at(0);
		const lastSegment = segments.at(-1);
		if (firstSegment && lastSegment) {
			return `${firstSegment[0]}${lastSegment[0]}`;
		}
		return '';
	}

	return match[0];
}