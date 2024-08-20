'use strict';
/* Lenovo Ideapad Laptops */
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as Helper from '../lib/helper.js';

const {exitCode, fileExists, readFileInt, runCommandCtl} = Helper;

const LENOVO_PATH = '/sys/bus/platform/drivers/ideapad_acpi/VPC2004:00/conservation_mode';

export const LenovoSingleBattery = GObject.registerClass({
    Signals: {'threshold-applied': {param_types: [GObject.TYPE_STRING]}},
}, class LenovoSingleBattery extends GObject.Object {
    constructor(settings) {
        super();
        this.name = 'Lenovo non-thinkpad';
        this.type = 12;
        this.deviceNeedRootPermission = true;
        this.deviceHaveDualBattery = false;
        this.deviceHaveStartThreshold = false;
        this.deviceHaveVariableThreshold = false;
        this.deviceHaveBalancedMode = false;
        this.deviceHaveAdaptiveMode = false;
        this.deviceHaveExpressMode = false;
        this.deviceUsesModeNotValue = true;

        this._settings = settings;
        this.ctlPath = null;
    }

    isAvailable() {
        if (!fileExists(LENOVO_PATH))
            return false;
        this._settings.set_int('icon-style-type', 0);
        return true;
    }

    async setThresholdLimit(chargingMode) {
        this._chargingMode = chargingMode;
        if (this._chargingMode === 'ful')
            this._conservationMode = 0;
        else if (this._chargingMode === 'max')
            this._conservationMode = 1;

        if (this._verifyThreshold())
            return exitCode.SUCCESS;

        const [status] = await runCommandCtl(this.ctlPath, 'LENOVO', `${this._conservationMode}`, null, null);
        if (status === exitCode.ERROR) {
            this.emit('threshold-applied', 'failed');
            return exitCode.ERROR;
        }

        if (this._verifyThreshold())
            return exitCode.SUCCESS;

        if (this._delayReadTimeoutId)
            GLib.source_remove(this._delayReadTimeoutId);
        this._delayReadTimeoutId = null;

        await new Promise(resolve => {
            this._delayReadTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        });
        this._delayReadTimeoutId = null;

        if (this._verifyThreshold())
            return exitCode.SUCCESS;

        this.emit('threshold-applied', 'failed');
        return exitCode.ERROR;
    }

    _verifyThreshold() {
        if (readFileInt(LENOVO_PATH) === this._conservationMode) {
            this.mode = this._chargingMode;
            this.emit('threshold-applied', 'success');
            return true;
        }
        return false;
    }

    destroy() {
        if (this._delayReadTimeoutId)
            GLib.source_remove(this._delayReadTimeoutId);
        this._delayReadTimeoutId = null;
    }
});

