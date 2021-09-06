import {
  API,
  APIEvent,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  PlatformAccessory,
  PlatformAccessoryEvent,
  PlatformConfig,
  Characteristic,
  StaticPlatformPlugin,
  Service,
  AccessoryPlugin
} from 'homebridge';
import {promisify} from 'util';
import {exec, ChildProcess} from 'child_process';
// import { PLATFORM_NAME, PLUGIN_NAME } from './index';
import fakegato from 'fakegato-history';
import * as fs from 'fs';
import timestamp from 'time-stamp';
import process from 'process';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import localStorage from 'node-sessionstorage';
import {PhilipsAirPlatformConfig, DeviceConfig} from './configTypes';
import { PhilipsAirPlatformAccessory } from './purifierAccessory'

let hap: HAP;
let Accessory: typeof PlatformAccessory;


const pathToModule = '/home/sierenmusic/HomeKit/homebridge-philips-air/';
const { spawn } = require('child_process');
const pathTopyaircontrol = pathToModule.replace('dist/index.js', 'node_modules/philips-air/pyaircontrol.py');
const pathToSensorFiles = pathToModule.replace('dist/index.js', 'sensor/');

enum CommandType {
  GetFirmware = 0,
  GetFilters,
  GetStatus,
  SetData
}

export class PhilipsAirPlatform implements StaticPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
 // public readonly log: Logging;
  // private readonly config: PhilipsAirPlatformConfig;
  private FakeGatoHistoryService;
  private readonly timeout: number;
  private readonly config: PhilipsAirPlatformConfig;
  private readonly purifiers: Map<string, PhilipsAirPlatformAccessory> = new Map();
  private queueRunning = false;
  private children: Array<ChildProcess> = [];

  constructor(
    public readonly log: Logging,
    config: PlatformConfig,
    public readonly api: API
    ) {
    this.log = log;
    this.config = config as unknown as PhilipsAirPlatformConfig;
   // this.api = api;
    this.FakeGatoHistoryService = fakegato(this.api);
    this.timeout = (this.config.timeout_seconds || 5) * 1000;

    api.on(APIEvent.DID_FINISH_LAUNCHING, this.didFinishLaunching.bind(this));
  }


  didFinishLaunching(): void {
    const ips: Array<string> = [];
    // this.config.devices.forEach((device: DeviceConfig) => {
    //   this.addAccessory(device);
    //   const uuid = this.api.hap.uuid.generate(device.ip);
    //   ips.push(uuid);
    // });

  }


  accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): void {
    let accessories: PhilipsAirPlatformAccessory[] = []
    this.config.devices.forEach((config: DeviceConfig) => {
      this.log('[' + config.name + '] Initializing accessory...');

      this.log(config.name);
      this.log(config.ip);
      const uuid = this.api.hap.uuid.generate(config.ip);

      let accessory = new PhilipsAirPlatformAccessory(this, config);
      
      accessories.push(accessory);
    });
    callback(accessories);
  }
}


// export = (api: API): void => {
//   hap = api.hap;
//   Accessory = api.platformAccessory;
//  // private FakeGatoHistoryService FakeGatoHistoryService;  
//   api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, PhilipsAirPlatform);
// };
