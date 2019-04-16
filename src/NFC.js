"use strict";

import pcsclite from '@pokusew/pcsclite';
import EventEmitter from 'events';
import Reader from './Reader';

class NFC extends EventEmitter {

	pcsc = null;
	logger = null;

	constructor() {
		super();

		this.pcsc = pcsclite();

		this.logger = {
			log: function () {
			},
			debug: function () {
			},
			info: function () {
			},
			warn: function () {
			},
			error: function () {
			}
		};

		this.pcsc.on('reader', (reader) => {

			this.logger.info('New reader detected', reader.name);

			const device = new Reader(reader);

			this.emit('reader', device);

		});

		this.pcsc.on('error', (err) => {

			this.logger.info('PCSC error', err.message);

			this.emit('error', err);

		});

	}

	close() {

		this.pcsc.close();
		
	}

}

export default NFC;
