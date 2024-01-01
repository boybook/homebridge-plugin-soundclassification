import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, Categories } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { SoundClassificationPlatformAccessory } from './platformAccessory';
import { WSClientInfo, WebSocketServer } from './websocketServer';

/**
 * HomebridgePlatform
 * 这个类是你的插件的主要构造器，你应该在这里解析用户配置并且发现/注册配件到Homebridge。
 */
export class SoundClassificationPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // 这个用来跟踪恢复的缓存配件
  public accessories: PlatformAccessory[] = [];
  public accessoriesMap: { [key: string]: SoundClassificationPlatformAccessory } = {};
  public websocketServer?: WebSocketServer;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('完成平台初始化:', this.config.name);
    this.accessories = [];

    this.api.on('didFinishLaunching', () => {
      // 初始化配置
      if (!this.config.effective_sounds) {
        log.debug('未配置有效声音, 使用默认值');
        this.config.effective_sounds = [
          'Telephone',
          'Telephone bell ringing',
          'Alarm clock',
          'Alarm',
          'Beep, bleep',
          'Ringtone',
          'Knock',
        ];
      }
      // 启动websocket服务器
      this.websocketServer = new WebSocketServer(
        this.log,
        this.config.websocketPort,
        info => this.callbackDeviceOnline(info),
        (info, result) => this.callbackDevicePushProbability(info, result),
      );
      // 运行方法来发现 / 注册你的设备作为配件
      this.discoverDevices();
    });
    this.api.on('shutdown', () => {
      if (this.websocketServer) {
        this.websocketServer.close();
      }
    });
  }

  callbackDeviceOnline(info: WSClientInfo) {
    const accessory = this.accessories.find(accessory => accessory.UUID === info.uuid);
    if (!accessory) {
      // 未找到配件
      this.log.info('未找到配件, 正在新建:', info.name, info.uuid);
      // 新建
      const uuid = info.uuid;
      const accessory = new this.api.platformAccessory(info.name + ' Bell', uuid, Categories.DOOR_LOCK);
      accessory.context.device = info;
      const instance = new SoundClassificationPlatformAccessory(this, accessory);
      this.accessoriesMap[uuid] = instance;
      // 将配件链接到你的平台
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.accessories.push(accessory);
    }
  }

  callbackDevicePushProbability(info: WSClientInfo, result: { index: number; display_name: string; probability: number }[]) {
    const accessory = this.accessories.find(accessory => accessory.UUID === info.uuid);
    if (accessory && this.accessoriesMap[info.uuid] instanceof SoundClassificationPlatformAccessory) {
      this.accessoriesMap[info.uuid].checkSound(result);
    }
  }

  /**
   * 当homebridge在启动时从磁盘恢复缓存配件时，这个函数会被调用。
   * 它应该被用来设置特性的事件处理器并更新相应的值。
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('从缓存加载配件:', accessory.displayName);

    // 将恢复的配件添加到配件缓存，这样我们就可以跟踪它是否已经被注册
    this.accessories.push(accessory);
  }

  discoverDevices() {
    // 直接遍历配置文件中的设备
    for (const accessory of this.accessories) {
      this.log.info('移除配件:', accessory.displayName);
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      /* const device = accessory.context.device;
      if (device) {
        this.log.info('从缓存恢复现有配件:', device.name, device.uuid);
        new SoundClassificationPlatformAccessory(this, accessory);
      } */
    }
    // 清空配件缓存
    this.accessories.splice(0, this.accessories.length);
  }
}