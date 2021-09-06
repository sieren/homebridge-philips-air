import { AccessoryPlugin, APIEvent, CharacteristicSetCallback, HAP, Service, Logging, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { PhilipsAirPlatform } from './platform';
import fakegato from 'fakegato-history';
import {PhilipsAirPlatformConfig, DeviceConfig} from './configTypes';
import {PurifierStatus, PurifierFilters, PurifierFirmware} from './deviceTypes';

import {AirClient, HttpClient, CoapClient, PlainCoapClient, HttpClientLegacy} from 'philips-air';
import * as fs from 'fs';
import timestamp from 'time-stamp';
import process from 'process';
import localStorage from 'node-sessionstorage';
import {exec, ChildProcess} from 'child_process';
const { spawn, ChildProcess } = require('child_process');

type Purifier = {
  historyService: any,
  client: AirClient,

};

let hap: HAP;

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class PhilipsAirPlatformAccessory implements AccessoryPlugin {
  private FakegatoHistoryService;
  private log: Logging;
  public children: Array<ChildProcess> = new Array(0);
  private updateTimer?: NodeJS.Timeout
  private hap: HAP

  // Device
  public displayName: string;
  public name: string;
  private config: DeviceConfig;
  private timeout?: NodeJS.Timeout;
  private lastfirmware?: number;
  private lastfilters?: number;
  private laststatus?: number;
  private aqil?: number;
  private uil?: string;
  private rh?: number;
  private rhset?: number;
  private func?: string;
  private pwr?: number

  // Services
  private readonly informationService: Service;
  private readonly purifierService: Service;
  private readonly airQualityService : Service;
  private readonly historyService: any;
  private readonly hepaFilterService: Service;
  private readonly carbonFilterService: Service;
  private readonly preFilterService: Service;

  private readonly batteryService: Service;
  private readonly temperatureService: Service;
  private readonly humidityService: Service;

  public readonly services: Service[];
  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private exampleStates = {
    On: false,
    Brightness: 100,
  };

  constructor(
    private readonly platform: PhilipsAirPlatform,
    private readonly deviceConfig: DeviceConfig
  ) {
    this.FakegatoHistoryService = fakegato(this.platform.api);
    this.log = this.platform.log;
    this.config = deviceConfig
    this.displayName = this.config.name
    this.name = this.config.name;
    this.hap = this.platform.api.hap
    var self = this
    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
  
  //  this.platform.api.on(APIEvent.DID_FINISH_LAUNCHING, this.didFinishLaunching.bind(this));
    this.updateTimer = setInterval(function(this: PhilipsAirPlatformAccessory) {
      self.children.forEach((child) => {
        child.kill();
      });
      self.children = [];
      self.updatePolling();
    }, 60000 * 12);


    // set accessory information
    this.informationService = new this.platform.Service.AccessoryInformation;



    this.informationService
    .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Default-Manufacturer')
    .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
    .setCharacteristic(this.platform.Characteristic.SerialNumber, '12333113');
    this.purifierService = new this.hap.Service.AirPurifier("Air Purifier", this.name)
        this.informationService
          .updateCharacteristic(this.hap.Characteristic.Manufacturer, 'Philips')
          .updateCharacteristic(this.hap.Characteristic.SerialNumber, '12333113')
    this.airQualityService = new this.hap.Service.AirQualitySensor('Air Quality', this.name);
    this.airQualityService.addCharacteristic(this.hap.Characteristic.VOCDensity).setProps({
      maxValue: 65535,
      minValue: 0,
      minStep: 0.1
    })

    this.batteryService = new this.platform.Service.Battery("Battery", this.name)
    this.batteryService.updateCharacteristic(this.hap.Characteristic.BatteryLevel, 99)
    this.batteryService.updateCharacteristic(this.hap.Characteristic.ChargingState, 0);
    this.batteryService.updateCharacteristic(this.hap.Characteristic.StatusLowBattery, 0)

    this.temperatureService = new this.hap.Service.TemperatureSensor("Temperature", this.name)
    this.temperatureService.updateCharacteristic(this.hap.Characteristic.TemperatureDisplayUnits, "Celsius");
    this.humidityService = new this.hap.Service.HumiditySensor("Humidity", this.name);

    this.preFilterService = new this.hap.Service.FilterMaintenance('Pre-filter', 'Pre-filter');
    this.carbonFilterService = new this.hap.Service.FilterMaintenance('Active carbon filter', 'Active carbon filter');
    this.hepaFilterService = new this.hap.Service.FilterMaintenance('HEPA filter', 'HEPA filter');
  
    let min_step_purifier_speed = 25;
    if (this.deviceConfig.sleep_speed) {
      min_step_purifier_speed = 20;
    }
    this.purifierService
    .getCharacteristic(this.hap.Characteristic.Active)
    .on('set', async(state: CharacteristicValue, callback: CharacteristicSetCallback) => {
      try {
        await this.setPower(state);
        callback();
      } catch (err) {
        callback(err);
      }
    });

    this.purifierService
    .getCharacteristic(this.hap.Characteristic.TargetAirPurifierState)
    .on('set', async(state: CharacteristicValue, callback: CharacteristicSetCallback) => {
      try {
        await this.setMode(state);
        callback();
      } catch (err) {
        callback(err);
      }
    });

    this.purifierService
    .getCharacteristic(this.hap.Characteristic.LockPhysicalControls)
    .on('set', async(state: CharacteristicValue, callback: CharacteristicSetCallback) => {
      try {
        await this.setLock(state);
        callback();
      } catch (err) {
        callback(err);
      }
    });

    this.purifierService
    .getCharacteristic(this.hap.Characteristic.RotationSpeed)
    .on('set', async(state: CharacteristicValue, callback: CharacteristicSetCallback) => {
      try {
        await this.setFan(state);
        callback();
      } catch (err) {
        callback(err);
      }
    }).setProps({
      minValue: 0,
      maxValue: 100,
      minStep: min_step_purifier_speed
    });

    this.services = [
      this.informationService,
      this.airQualityService,
      this.temperatureService,
      this.humidityService,
      this.purifierService,
      this.hepaFilterService,
      this.carbonFilterService,
      this.preFilterService,
      this.batteryService
    ]
  
    this.historyService = new this.FakegatoHistoryService('room2', this, {
      log: this.platform.log,
      storage: 'fs'
    });
    this.services.push(this.historyService)
    this.updatePolling();
  }


  updatePolling() {
      var child = spawn('/usr/local/bin/aioairctrl', ['-H', this.deviceConfig.ip, 'status-observe', '-J']);
      child.on('exit', (code: any) => {
        this.log.error(`Exit code is: ${code}`);
      });

    //  child.stdout.setEncoding('utf8');
    //  child.stdout.pipe(process.stdout);
      child.stdout.on('data', (data: any) => {
        this.log.error("Got some new stuff!");
        const obj = JSON.parse(data.toString());
        this.log.error(obj);
        this.log.error("GOT DATA!!");
        localStorage.setItem('pwr', obj.pwr);
        localStorage.setItem('om', obj.om);
        localStorage.setItem('aqil', obj.aqil);
        localStorage.setItem('uil', obj.uil);
        localStorage.setItem('mode', obj.mode);
        localStorage.setItem('func', obj.func);
        localStorage.setItem('rhset', obj.rhset);
        localStorage.setItem('iaql', obj.iaql);
        localStorage.setItem('pm25', obj.pm25);
        localStorage.setItem('rh', obj.rh);
        localStorage.setItem('temp', obj.temp);
        localStorage.setItem('rddp', obj.rddp);
        localStorage.setItem('wl', obj.wl);
        localStorage.setItem('fltt1', obj.fltt1);
        localStorage.setItem('fltt2', obj.fltt2);
        localStorage.setItem('fltsts0', obj.fltsts0);
        localStorage.setItem('fltsts1', obj.fltsts1);
        localStorage.setItem('fltsts2', obj.fltsts2);
        localStorage.setItem('wicksts', obj.wicksts);

        const name = obj.modelid;

        this.informationService
          .updateCharacteristic(this.hap.Characteristic.Manufacturer, 'Philips')
          .updateCharacteristic(this.hap.Characteristic.SerialNumber, '12333113')
          .updateCharacteristic(this.hap.Characteristic.Model, name)
          .updateCharacteristic(this.hap.Characteristic.FirmwareRevision, obj.swversion);
        const fltsts0change = obj.fltsts0 == 0;
        const fltsts0life = obj.fltsts0 / 360 * 100;

        this.preFilterService
          .updateCharacteristic(this.hap.Characteristic.FilterChangeIndication, fltsts0change)

      
        const fltsts2change = obj.fltsts2 == 0;
        const fltsts2life = obj.fltsts2 / 2400 * 100;

        this.carbonFilterService
          .updateCharacteristic(this.hap.Characteristic.FilterChangeIndication, fltsts2change)
          .updateCharacteristic(this.hap.Characteristic.FilterLifeLevel, fltsts2life);

        const fltsts1change = obj.fltsts1 == 0;
        const fltsts1life = obj.fltsts1 / 4800 * 100;

        this.hepaFilterService
          .updateCharacteristic(this.hap.Characteristic.FilterChangeIndication, fltsts1change)

        const state = parseInt(obj.pwr) * 2;
        this.pwr = parseInt(obj.pwr);
        this.purifierService
          .updateCharacteristic(this.hap.Characteristic.Active, obj.pwr)
          .updateCharacteristic(this.hap.Characteristic.CurrentAirPurifierState, state)
          .updateCharacteristic(this.hap.Characteristic.LockPhysicalControls, obj.cl);

        const iaql = Math.ceil(obj.iaql / 3);
        this.airQualityService
          .updateCharacteristic(this.hap.Characteristic.AirQuality, iaql)
          .updateCharacteristic(this.hap.Characteristic.VOCDensity, Math.round(obj.pm25 * 4.57));
        this.historyService.addEntry({time: Math.round(new Date().valueOf() / 1000), temp: 0, humidity: 0, voc: Math.round(obj.pm25 * 4.57)});
      });
      this.children.push(child);
    }

  async setPower(state: CharacteristicValue): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
     // purifier.laststatus = Date.now();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const stateNumber = this.pwr == 0 ? 1 : 0;
      this.purifierService.updateCharacteristic(this.hap.Characteristic.CurrentAirPurifierState, stateNumber as number * 2);
      var child = exec(`/usr/local/bin/aioairctrl -H ${this.deviceConfig.ip} set pwr=${stateNumber}`);
      this.log.error("POWER CHILD SPAWNED " + stateNumber);
    } catch (err) {
      this.log.error('[' + this.deviceConfig.name + '] Error setting power: ' + err);
    }
  }

  async setBrightness(state: CharacteristicValue): Promise<void> {
    const values = {
      aqil: state,
      uil: state ? '1' : '0'
    };

    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // await this.enqueuePromise(CommandType.SetData, purifier, values);
      var child = exec(`/usr/local/bin/aioairctrl -H ${this.deviceConfig.ip} set uil=${values.uil}`);
    } catch (err) {
      this.log.error('[' + this.deviceConfig.name + '] Error setting brightness: ' + err);
    }
  }

  async setMode(state: CharacteristicValue): Promise<void> {
    const values = {
      mode: state ? 'P' : 'M'
    };
    if (this.deviceConfig.allergic_func) {
      values.mode = state ? 'P' : 'A';
    } else {
      values.mode = state ? 'P' : 'M';
    }
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      // await this.enqueuePromise(CommandType.SetData, purifier, values);
      var child = exec(`/usr/local/bin/aioairctrl -H ${this.deviceConfig.ip} set mode=${values.mode}`);
      if (state != 0) {
        this.purifierService
          .updateCharacteristic(this.hap.Characteristic.RotationSpeed, 0)
          .updateCharacteristic(this.hap.Characteristic.TargetAirPurifierState, state);
      }
    } catch (err) {
      this.log.error('[' + this.deviceConfig.name + '] Error setting mode: ' + err);
    }
  }

  async setLock(state: CharacteristicValue): Promise<void> {
    const values = {
      cl: state == 1
    };

    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
    //  await this.enqueuePromise(CommandType.SetData, purifier, values);
      var child = exec(`/usr/local/bin/aioairctrl -H ${purifier.config.ip} set cl=${values.cl}`);
    } catch (err) {
      this.log.error('[' + this.deviceConfig.name + '] Error setting lock: ' + err);
    }
  }

  async setFan(state: CharacteristicValue): Promise<void> {
    let divisor = 25;
    let offset = 0;
    if (this.deviceConfig.sleep_speed) {
      divisor = 20;
      offset = 1;
    }
    const speed = Math.ceil(state as number / divisor);
    if (speed > 0) {
      const values = {
        mode: 'M',
        om: ''
      };
      if (offset == 1 && speed == 1) {
        values.om = 's';
      } else if (speed < 4 + offset) {
        values.om = (speed - offset).toString();
      } else {
        values.om = 't';
      }

      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
      //  await this.enqueuePromise(CommandType.SetData, purifier, values);
        var child = exec(`/usr/local/bin/aioairctrl -H ${purifier.config.ip} set om=${values.om}`);
        this.purifierService.updateCharacteristic(this.hap.Characteristic.TargetAirPurifierState, 0);

        if (this.timeout) {
          clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {
          this.purifierService.updateCharacteristic(this.hap.Characteristic.RotationSpeed, speed * divisor);
          this.timeout = undefined;
        }, 1000);
      } catch (err) {
        this.log.error('[' + this.deviceConfig.name + '] Error setting fan: ' + err);
      }
    }
  }

  getServices(): Service[] {
    return this.services;
  }
}
