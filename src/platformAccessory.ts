import { Service, PlatformAccessory } from 'homebridge';

import { SoundClassificationPlatform } from './platform';

/**
 * 平台配件
 * 您平台注册的每个配件都会创建此类的一个实例
 * 每个配件可能会暴露多个不同服务类型的服务。
 **/

export class SoundClassificationPlatformAccessory {
  private serviceBell: Service;
  private serviceSensor: Service;

  constructor(
    private readonly platform: SoundClassificationPlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // 设置配件信息
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.accessory.context.device.name)
      .setCharacteristic(this.platform.Characteristic.Model, this.accessory.context.device.name)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.device.uuid);

    // 获取或创建Doorbell服务
    this.serviceBell = this.accessory.getService(this.platform.Service.Doorbell)
     || this.accessory.addService(this.platform.Service.Doorbell);

    this.serviceSensor = this.accessory.getService(this.platform.Service.MotionSensor)
     || this.accessory.addService(this.platform.Service.MotionSensor);
    this.serviceSensor.getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(this.handleMotionDetectedGet.bind(this));

    // 设置服务名称
    this.serviceBell.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
    this.serviceSensor.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);
  }

  /**
   * Handle requests to get the current value of the "Current Relative Humidity" characteristic
   */
  handleMotionDetectedGet() {
    const lastTriggered = this.accessory.context.lastTriggered;
    const now = Date.now();
    const cooldown = 5000;
    const currentValue = lastTriggered && now - lastTriggered < cooldown;
    return !!currentValue;
  }

  checkNeedRing(result: { index: number; display_name: string; probability: number }[]) {
    if (result.length > 0) {
      const effective_sounds = this.platform.config.effective_sounds;
      const result0 = result[0];
      if (result0.display_name === 'Music' && result.length > 1) {
        const result1 = result[1];
        return effective_sounds.find((s: string) => s === result1.display_name) && result1.probability > 0.4;
      }
      return effective_sounds.find((s: string) => s === result0.display_name) && result0.probability > 0.5;
    }
    return false;
  }

  checkSound(result: { index: number; display_name: string; probability: number }[]) {
    // 判断是否需要响铃
    if (this.checkNeedRing(result)) {
      if (this.serviceBell) {
        const characteristic = this.serviceBell.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent);
        if (characteristic) {
          // 获取上次触发的时间
          const lastTriggered = this.accessory.context.lastTriggered;
          const now = Date.now();
          const cooldown = 1000;
          if (!lastTriggered || now - lastTriggered > cooldown) {
            // 更新上次触发的时间
            this.accessory.context.lastTriggered = now;

            // TODO 门铃响
            this.platform.log.info('响铃:', this.accessory.context.device.name, this.accessory.context.device.uuid,
              result[0].display_name, result[0].probability);
            characteristic.updateValue(1);
          }
        }
      }
    }
  }

}