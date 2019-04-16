"use strict";

import EventEmitter from 'events';
import {
	ConnectError,
	DisconnectError,
	TransmitError,
	ControlError,
	CARD_NOT_CONNECTED,
	FAILURE
} from './errors';


export const TAG_ISO_14443_3 = 'TAG_ISO_14443_3';
export const TAG_ISO_14443_4 = 'TAG_ISO_14443_4';

export const KEY_TYPE_A = 0x60;
export const KEY_TYPE_B = 0x61;

export const CONNECT_MODE_DIRECT = 'CONNECT_MODE_DIRECT';
export const CONNECT_MODE_CARD = 'CONNECT_MODE_CARD';


class Reader extends EventEmitter {

	reader = null;
	logger = null;

	connection = null;
	card = null;

	autoProcessing = true;
	_aid = null;
	_parsedAid = null;

	keyStorage = {
		'0': null,
		'1': null
	};

	pendingLoadAuthenticationKey = {};

	static reverseBuffer(src) {

		const buffer = new Buffer(src.length);

		for (let i = 0, j = src.length - 1; i <= j; ++i, --j) {
			buffer[i] = src[j];
			buffer[j] = src[i];
		}

		return buffer;

	}

	static parseAid(str) {

		const result = [];

		for (let i = 0; i < str.length; i += 2) {
			result.push(parseInt(str.substr(i, 2), 16));
		}

		return result;

	}

	static selectStandardByAtr(atr) {

		// TODO: better detecting card types
		if (atr[5] && atr[5] === 0x4f) {
			return TAG_ISO_14443_3;
		}
		else {
			return TAG_ISO_14443_4;
		}

	}

	get aid() {
		return this._aid;
	}

	set aid(value) {

		console.info('Setting AID to', value);
		this._aid = value;

		const parsedAid = Reader.parseAid(value);
		console.info('AID parsed', parsedAid);
		this._parsedAid = parsedAid;

	}

	get name() {
		return this.reader.name;
	}

	constructor(reader) {

		super();

		this.reader = reader;

		this.reader.on('error', (err) => {

			console.error(err);

			this.emit('error', err);

		});

		this.reader.on('status', async status => {

			console.debug('status', status);

			// check what has changed
			const changes = this.reader.state ^ status.state;

			console.debug('changes', changes);

			if (changes) {

				if ((changes & this.reader.SCARD_STATE_EMPTY) && (status.state & this.reader.SCARD_STATE_EMPTY)) {

					console.info('card removed');

					if (this.card) {
						this.emit('card.off', { ...this.card });
					}

					try {

						this.card = null;
						if (this.connection) {
							await this.disconnect();
						}

					} catch (err) {

						this.emit(err);

					}

				}
				else if ((changes & this.reader.SCARD_STATE_PRESENT) && (status.state & this.reader.SCARD_STATE_PRESENT)) {

					const atr = status.atr;

					console.info('card inserted', atr);

					this.card = {};

					if (atr) {
						this.card.atr = atr;
						this.card.standard = Reader.selectStandardByAtr(atr);
						this.card.type = this.card.standard;
					}

					try {

						await this.connect();

						if (!this.autoProcessing) {
							this.emit('card', this.card);
							return;
						}

						this.handleTag();

					} catch (err) {

						this.emit(err);

					}


				}
			}
		});

		this.reader.on('end', () => {

			console.info('reader removed');

			this.emit('end');

		});

	}

	connect(mode = CONNECT_MODE_CARD) {

		const modes = {
			[CONNECT_MODE_DIRECT]: this.reader.SCARD_SHARE_DIRECT,
			[CONNECT_MODE_CARD]: this.reader.SCARD_SHARE_SHARED,
		};

		if (!modes[mode]) {
			throw new ConnectError('invalid_mode', 'Invalid mode')
		}

		console.info('trying to connect', mode, modes[mode]);

		return new Promise((resolve, reject) => {

			// connect card
			this.reader.connect({
				share_mode: modes[mode],
				//protocol: this.reader.SCARD_PROTOCOL_UNDEFINED
			}, (err, protocol) => {

				if (err) {
					const error = new ConnectError(FAILURE, 'An error occurred while connecting.', err);
					console.error(error);
					return reject(error);
				}

				this.connection = {
					type: modes[mode],
					protocol: protocol
				};

				console.info('connected', this.connection);

				return resolve(this.connection);

			});

		});

	}

	disconnect() {

		if (!this.connection) {
			throw new DisconnectError('not_connected', 'Reader in not connected. No need for disconnecting.')
		}

		console.info('trying to disconnect', this.connection);

		return new Promise((resolve, reject) => {

			// disconnect removed
			this.reader.disconnect(this.reader.SCARD_LEAVE_CARD, (err) => {

				if (err) {
					const error = new DisconnectError(FAILURE, 'An error occurred while disconnecting.', err);
					console.error(error);
					return reject(error);
				}

				this.connection = null;

				console.info('disconnected');

				return resolve(true);

			});

		});

	}

	transmit(data, responseMaxLength) {

		if (!this.card || !this.connection) {
			throw new TransmitError(CARD_NOT_CONNECTED, 'No card or connection available.');
		}

		return new Promise((resolve, reject) => {

			console.log('transmitting', data, responseMaxLength);

			this.reader.transmit(data, responseMaxLength, this.connection.protocol, (err, response) => {

				if (err) {
					const error = new TransmitError(FAILURE, 'An error occurred while transmitting.', err);
					return reject(error);
				}

				return resolve(response);

			});

		});

	}

	control(data, responseMaxLength) {

		if (!this.connection) {
			throw new ControlError('not_connected', 'No connection available.');
		}

		return new Promise((resolve, reject) => {

			console.log('transmitting control', data, responseMaxLength);

			this.reader.control(data, this.reader.SCARD_CTL_CODE(3500), responseMaxLength, (err, response) => {

				if (err) {
					const error = new ControlError(FAILURE, 'An error occurred while transmitting control.', err);
					return reject(error);
				}

				return resolve(response);

			});

		});

	}

	close() {

		this.reader.close();

	}

}

export default Reader;
