import moment from "moment";
import { Bridge } from "./bridgestuff/Bridge";
import { Settings } from "./settings/Settings";
import { Logger } from "./Logger";
import path from "path";
import { PersistentMessageMap } from "./PersistentMessageMap";

type Direction = "d2t" | "t2d";

const MAX_32_BIT = 0x7fffffff;

/** Handles mapping between message IDs in discord and telegram, for message editing purposes */
export class MessageMap {
	private _map: Map<string, any>;
	private _persistentMap: PersistentMessageMap;
	private _messageTimeoutAmount: number;
	private _messageTimeoutUnit: moment.unitOfTime.DurationConstructor;

	constructor(settings: Settings, logger: Logger, dataDirPath: string) {
		/** The map itself */
		this._map = new Map();
		this._persistentMap = <PersistentMessageMap>{};
		this._messageTimeoutAmount = settings.messageTimeoutAmount;
		this._messageTimeoutUnit = settings.messageTimeoutUnit;
		if (settings.persistentMessageMap) {
			this._persistentMap = new PersistentMessageMap(logger, path.join(dataDirPath, "persistentMessageMap.json"));
			this._map = this._persistentMap.getMap();
		}
	}

	/**
	 * Inserts a mapping into the map
	 *
	 * @param direction One of the two direction constants of this class
	 * @param bridge The bridge this mapping is for
	 * @param fromId Message ID to map from, i.e. the ID of the message the bot received
	 * @param toId	Message ID to map to, i.e. the ID of the message the bot sent
	 */
	insert(direction: Direction, bridge: Bridge, fromId: string, toId: string) {
		// Get/create the entry for the bridge
		let keyToIdsMap = this._map.get(bridge.name);
		if (keyToIdsMap === undefined) {
			keyToIdsMap = new Map();
			this._map.set(bridge.name, keyToIdsMap);
		}

		// Generate the key and get the corresponding IDs
		const key = `${direction} ${fromId}`;
		let toIds = keyToIdsMap.get(key);
		if (toIds === undefined) {
			toIds = new Set();
			keyToIdsMap.set(key, toIds);
		}

		// Shove the new ID into it
		toIds.add(toId);

		//Check if persistent MessageMap is enabled
		if (Object.keys(this._persistentMap).length === 0) {
			// Start a timeout removing it again after a configured amount of time. Default is 24 hours
			safeTimeout(() => {
				keyToIdsMap.delete(key);
			}, moment.duration(this._messageTimeoutAmount, this._messageTimeoutUnit).asMilliseconds());
		} else {
			//Update the Persistent MessageMap with the current MessageMap
			this._persistentMap.updateMap(this._map);
		}

		// Start a timeout removing it again after a configured amount of time. Default is 24 hours
		// setTimeout(() => {
		// 	keyToIdsMap.delete(key);
		// }, moment.duration(this._messageTimeoutAmount, this._messageTimeoutUnit).asMilliseconds());
	}

	/**
	 * Gets the ID of a message the bot sent based on the ID of the message the bot received
	 *
	 * @param direction One of the two direction constants of this class
	 * @param bridge The bridge this mapping is for
	 * @param fromId Message ID to get corresponding ID for, i.e. the ID of the message the bot received the message
	 *
	 * @returns Message IDs of the corresponding message, i.e. the IDs of the messages the bot sent
	 */
	getCorresponding(direction: Direction, bridge: Bridge, fromId: string) {
		try {
			// Get the key-to-IDs map
			const keyToIdsMap = this._map.get(bridge.name);

			// Create the key
			const key = `${direction} ${fromId}`;

			// Extract the IDs
			const toIds = keyToIdsMap.get(key);

			// Return the ID
			return [...toIds];
		} catch (err) {
			// Unknown message ID. Don't do anything
			return [];
		}
	}

	getCorrespondingReverse(_direction: string, bridge: Bridge, toId: string) {
		// The ID to return
		let fromId = [];

		// Get the mappings for this bridge
		const keyToIdsMap = this._map.get(bridge.name);
		if (keyToIdsMap !== undefined) {
			// Find the ID
			const [key] = [...keyToIdsMap].find(([, ids]) => ids.has(toId));
			fromId = key.split(" ");
			fromId.shift();
		}

		return fromId;
	}

	/** Constant indicating direction discord to telegram */
	static get DISCORD_TO_TELEGRAM(): "d2t" {
		return "d2t";
	}

	/** Constant indicating direction telegram to discord */
	static get TELEGRAM_TO_DISCORD(): "t2d" {
		return "t2d";
	}
}

// Recursive Timeout to handle delays larger than the maximum value of 32-bit signed integers
function safeTimeout(onTimeout: Function, delay: number) {
	setTimeout(() => {
		if (delay > MAX_32_BIT) {
			return safeTimeout(onTimeout, delay - MAX_32_BIT);
		} else {
			onTimeout();
		}
	}, Math.min(MAX_32_BIT, delay));
}